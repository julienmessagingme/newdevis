/**
 * AssistantWidget — bouton flottant + bulle popover sur la home (et autres onglets).
 *
 * UX : bouton flottant en bas-droite (style Intercom/Crisp) → click ouvre une
 * bulle popover 380×600px avec greeting + 6 suggestions (3 Q&A + 3 actions IA)
 * ou l'historique de la conversation.
 *
 * Architecture : le widget partage la **même** thread que l'onglet Assistant
 * chantier (table `chantier_assistant_messages`). Le bouton "ouvrir en grand"
 * (↗) navigue vers l'onglet et ferme la bulle — la conversation continue
 * sans rupture côté user.
 *
 * Cycle de vie :
 *  - Refresh de l'historique à chaque ouverture du widget (pas de polling auto)
 *  - Optimistic UI à l'envoi : le message user apparaît avant la réponse server
 *  - L'agent peut prendre des actions → encart vert "✅ Action prise" affiché
 *    juste après le message assistant si `tools_executed.length > 0`
 *
 * Caché si `hidden = true` (typiquement quand l'user est déjà sur l'onglet
 * Assistant — éviter la double UI).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, RefreshCw, Maximize2, AlertTriangle } from 'lucide-react';

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent_initiated: boolean;
  is_read: boolean;
  created_at: string;
  // Encart action (uniquement disponible juste après l'envoi, pas re-fetché du thread)
  tools_executed?: string[];
}

interface Suggestion {
  icon: string;
  label: string;
  message: string; // texte envoyé à l'agent
  category: 'qa' | 'action';
}

const SUGGESTIONS: Suggestion[] = [
  // Q&A — 3 questions d'information
  { icon: '📋', label: 'Démarches admin urgentes ?', message: 'Quelles démarches administratives sont urgentes sur mon chantier ?', category: 'qa' },
  { icon: '💰', label: 'Suis-je éligible aux aides ?', message: 'Suis-je éligible aux aides MaPrimeRénov, CEE ou éco-PTZ ?', category: 'qa' },
  { icon: '⚠️', label: 'Quels risques actuels ?', message: 'Quels sont les risques actuels sur mon chantier ?', category: 'qa' },
  // Actions — 3 actions IA
  { icon: '✅', label: 'Crée une tâche pour demain', message: 'Crée une tâche urgente pour demain', category: 'action' },
  { icon: '📅', label: 'Décale un lot dans le planning', message: 'Quels lots peux-tu décaler dans mon planning ?', category: 'action' },
  { icon: '💬', label: 'Envoie un WhatsApp à un artisan', message: 'Je veux envoyer un message WhatsApp à un artisan, lequel ?', category: 'action' },
];

interface Props {
  chantierId: string;
  token: string | null | undefined;
  /** Cache complètement le widget (typiquement quand on est sur l'onglet Assistant). */
  hidden?: boolean;
  /** Appelé quand l'user clique "Ouvrir en grand" → navigateTo('assistant') côté parent. */
  onOpenFull: () => void;
}

export default function AssistantWidget({ chantierId, token, hidden, onOpenFull }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // ── Fetch thread ────────────────────────────────────────────────────────────
  const fetchThread = useCallback(async () => {
    if (!chantierId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/assistant/thread`, {
        headers: authHeader,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const filtered: AssistantMessage[] = (data.messages ?? []).filter(
        (m: AssistantMessage) => m.role === 'user' || m.role === 'assistant'
      );
      setMessages(filtered);
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // Pas de message d'erreur intrusif — le badge unread reste à 0,
      // le user verra juste l'état vide. Erreur silencieuse à dessein.
    } finally {
      setLoading(false);
    }
    // Stable deps — authHeader rebuilt each render but content identique
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierId, token]);

  // Fetch au mount (pour le badge unread sur le FAB) + à chaque ouverture (refresh)
  useEffect(() => { fetchThread(); }, [fetchThread]);
  useEffect(() => { if (open) fetchThread(); }, [open, fetchThread]);

  // Scroll bottom on new messages
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending, open]);

  // Focus input à l'ouverture
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 250);
  }, [open]);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || !token) return;

    setInput('');
    setSending(true);
    setError(null);

    // Optimistic update
    const tempId = `tmp-${Date.now()}`;
    const tempUserMsg: AssistantMessage = {
      id: tempId,
      role: 'user',
      content: trimmed,
      agent_initiated: false,
      is_read: true,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/chantier/${chantierId}/assistant/message`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const toolsExecuted: string[] = Array.isArray(data.tools_executed) ? data.tools_executed : [];

      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempId);
        return [
          ...withoutTemp,
          {
            id:              data.user_message.id,
            role:            'user',
            content:         data.user_message.content,
            agent_initiated: false,
            is_read:         true,
            created_at:      data.user_message.created_at,
          },
          {
            id:              data.assistant_message.id ?? `assistant-${Date.now()}`,
            role:            'assistant',
            content:         data.assistant_message.content,
            agent_initiated: false,
            is_read:         true,
            created_at:      data.assistant_message.created_at ?? new Date().toISOString(),
            tools_executed:  toolsExecuted.length > 0 ? toolsExecuted : undefined,
          },
        ];
      });
    } catch (err) {
      setError((err as Error).message ?? 'Erreur lors de l\'envoi.');
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (hidden) return null;

  // ══════════════════════════════════════════════════════════════════════════
  // FAB (état fermé) — bouton flottant en bas-GAUCHE (le bas-droite est réservé
  // au widget WhatsApp / support externe pour éviter la collision)
  // ══════════════════════════════════════════════════════════════════════════
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 lg:bottom-8 lg:left-8 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center z-40 group touch-manipulation"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Ouvrir l'Assistant chantier"
      >
        <Sparkles className="h-6 w-6 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-red-500 border-2 border-white text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-[11px] font-medium px-2 py-1 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden lg:block">
          Assistant chantier
        </span>
      </button>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BULLE (état ouvert) — popover 380×600 desktop, fullscreen mobile
  // ══════════════════════════════════════════════════════════════════════════
  const isEmpty = !loading && messages.length === 0;

  return (
    <>
      {/* Backdrop mobile uniquement (lg+ : pas de backdrop, le widget reste contextuel) */}
      <div
        className="fixed inset-0 bg-black/30 z-40 lg:hidden"
        onClick={() => setOpen(false)}
      />

      <div className="fixed inset-0 lg:inset-auto lg:bottom-6 lg:left-6 lg:w-[380px] lg:h-[600px] lg:max-h-[calc(100vh-3rem)] bg-white lg:rounded-2xl shadow-2xl border-0 lg:border border-gray-100 z-50 flex flex-col overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/40 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-md">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-tight">Assistant chantier</p>
            <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              En ligne · Pilote IA
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); onOpenFull(); }}
            title="Ouvrir l'Assistant complet"
            className="w-8 h-8 rounded-lg hover:bg-white/60 flex items-center justify-center text-gray-500 hover:text-indigo-600 transition-colors touch-manipulation"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-lg hover:bg-white/60 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors touch-manipulation"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
            </div>
          )}

          {/* Empty state — greeting + 6 suggestions */}
          {isEmpty && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex-1 bg-gray-50 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  <p className="text-[13px] text-gray-800 leading-relaxed">
                    Salut 👋 Je suis ton <strong>Pilote de Chantier IA</strong>. Je peux répondre à tes questions <strong>et prendre des actions</strong> sur le chantier.
                  </p>
                </div>
              </div>

              {/* Q&A */}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider px-1">💬 Demande-moi</p>
                {SUGGESTIONS.filter(s => s.category === 'qa').map(s => (
                  <button
                    key={s.message}
                    type="button"
                    onClick={() => sendMessage(s.message)}
                    disabled={sending}
                    className="w-full text-left text-[12px] px-3 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors disabled:opacity-50"
                  >
                    <span className="text-base mr-1.5">{s.icon}</span> {s.label}
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider px-1">⚡ Demande-moi de faire</p>
                {SUGGESTIONS.filter(s => s.category === 'action').map(s => (
                  <button
                    key={s.message}
                    type="button"
                    onClick={() => sendMessage(s.message)}
                    disabled={sending}
                    className="w-full text-left text-[12px] px-3 py-2.5 bg-amber-50/40 border border-amber-200/70 rounded-xl hover:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-50"
                  >
                    <span className="text-base mr-1.5">{s.icon}</span> {s.label}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-gray-400 text-center px-1 pt-1">
                Ou tape ta question directement ci-dessous ↓
              </p>
            </div>
          )}

          {/* Conversation history */}
          {!loading && messages.length > 0 && messages.map(msg => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <div className="flex gap-2 flex-row-reverse">
                  <div className="flex-1 max-w-[82%] flex justify-end">
                    <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5">
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                      <Sparkles className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                      <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                  {msg.tools_executed && msg.tools_executed.length > 0 && (
                    <div className="mt-2 mx-7 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                      <span className="text-base shrink-0">✅</span>
                      <p className="text-[11px] text-emerald-800 font-medium">
                        Action{msg.tools_executed.length > 1 ? 's' : ''} prise{msg.tools_executed.length > 1 ? 's' : ''} : {msg.tools_executed.join(', ')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Sending indicator */}
          {sending && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-red-700 flex-1">{error}</p>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Footer input ──────────────────────────────────────────────── */}
        <div className="px-3 py-3 border-t border-gray-100 bg-white shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <form onSubmit={handleSubmit} className="flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Pose une question ou demande une action..."
              disabled={sending}
              className="flex-1 text-[13px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 flex items-center justify-center text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
              aria-label="Envoyer"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => fetchThread()}
              disabled={loading}
              title="Rafraîchir l'historique"
              className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center transition-colors touch-manipulation"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </form>
          <p className="text-[9px] text-gray-400 text-center mt-2 px-2">
            💡 L'IA peut prendre des actions — elle te demande confirmation avant chaque envoi externe (WhatsApp, email)
          </p>
        </div>
      </div>
    </>
  );
}
