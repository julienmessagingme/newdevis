/**
 * ChantierAssistantChat — Composant de conversation avec le Pilote de Chantier IA.
 *
 * Deux tailles :
 * - compact : preview dans le cockpit (3 derniers messages + badge unread + bouton "Voir tout")
 * - full    : interface de chat complète (page "Assistant chantier")
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Send, Loader2, RefreshCw, AlertTriangle, User, Sparkles,
} from 'lucide-react';
import { ExpertAvatar } from '@/components/chantier/MATERIAL_IMAGES';

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent_initiated: boolean;
  is_read: boolean;
  created_at: string;
}

interface Props {
  chantierId: string;
  token: string | null | undefined;
  size: 'compact' | 'full';
  onOpenFull?: () => void; // called when compact requests full view
}

export default function ChantierAssistantChat({ chantierId, token, size, onOpenFull }: Props) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  // ── Fetch thread ────────────────────────────────────────────────────────────
  const fetchThread = useCallback(async () => {
    if (!chantierId || !token) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/chantier/${chantierId}/assistant/thread`, {
        headers: authHeader,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Only show user + assistant messages (not tool calls)
      const filtered: AssistantMessage[] = (data.messages ?? []).filter(
        (m: any) => m.role === 'user' || m.role === 'assistant'
      );
      setMessages(filtered);
      setUnreadCount(data.unread_count ?? 0);
    } catch (err) {
      setError('Impossible de charger la conversation.');
    } finally {
      setLoading(false);
    }
  }, [chantierId, token]);

  useEffect(() => { fetchThread(); }, [fetchThread]);

  // Scroll to bottom on new messages (full mode only)
  useEffect(() => {
    if (size === 'full' && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, size]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending || !token) return;

    setInput('');
    setSending(true);
    setError(null);

    // Optimistic update
    const tempUserMsg: AssistantMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
      agent_initiated: false,
      is_read: true,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/chantier/${chantierId}/assistant/message`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();

      // Replace temp user message + add assistant reply
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id);
        return [
          ...withoutTemp,
          {
            id: data.user_message.id,
            role: 'user',
            content: data.user_message.content,
            agent_initiated: false,
            is_read: true,
            created_at: data.user_message.created_at,
          },
          {
            id: data.assistant_message.id,
            role: 'assistant',
            content: data.assistant_message.content,
            agent_initiated: false,
            is_read: true,
            created_at: data.assistant_message.created_at,
          },
        ];
      });
    } catch (err) {
      setError((err as Error).message ?? 'Erreur lors de l\'envoi.');
      // Remove optimistic message
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── COMPACT mode ─────────────────────────────────────────────────────────────
  if (size === 'compact') {
    const lastMessages = messages.slice(-3);

    return (
      <div className="px-6 py-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ExpertAvatar size={36} showBadge />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-gray-900">Pilote de chantier</span>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center h-4.5 min-w-4.5 px-1 text-[10px] font-bold bg-primary text-white rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400">Votre assistant IA</p>
            </div>
          </div>
          <button
            onClick={() => fetchThread()}
            className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-primary/5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-gray-50 animate-pulse" />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && messages.length === 0 && (
          <div className="bg-indigo-50 rounded-xl px-4 py-4 text-center">
            <Sparkles className="h-6 w-6 text-indigo-300 mx-auto mb-1.5" />
            <p className="text-sm text-indigo-700 font-medium">Posez votre première question</p>
            <p className="text-xs text-indigo-400 mt-0.5">Je connais tout l'historique de votre chantier</p>
          </div>
        )}

        {/* Last messages preview */}
        {!loading && lastMessages.length > 0 && (
          <div className="space-y-2">
            {lastMessages.map(msg => (
              <div
                key={msg.id}
                className={`rounded-xl px-3.5 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary/8 text-gray-800 ml-6'
                    : msg.agent_initiated
                    ? 'bg-indigo-50 text-indigo-900 border border-indigo-100'
                    : 'bg-gray-50 text-gray-800'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1 mb-1">
                    <Bot className="h-3 w-3 text-primary" />
                    {msg.agent_initiated && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-primary">Nouveau</span>
                    )}
                  </div>
                )}
                <p className="line-clamp-3 leading-relaxed text-[13px]">{msg.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onOpenFull}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 rounded-xl transition-colors border border-primary/10"
        >
          <Bot className="h-4 w-4" />
          {messages.length === 0 ? 'Ouvrir l\'assistant' : 'Voir la conversation complète'}
        </button>
      </div>
    );
  }

  // ── FULL mode ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
        <ExpertAvatar size={40} showBadge />
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-gray-900 text-[15px]">Pilote de chantier</h2>
          <p className="text-xs text-gray-400">Votre assistant IA — connait tout l'historique du chantier</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchThread(); }}
          className="text-gray-400 hover:text-primary transition-colors p-2 rounded-lg hover:bg-gray-50"
          title="Rafraîchir"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-indigo-300" />
            </div>
            <h3 className="font-semibold text-gray-800 mb-1.5">Commencez la conversation</h3>
            <p className="text-sm text-gray-400 max-w-xs">
              Je connais votre chantier en détail. Demandez-moi n'importe quoi : planning, contacts, budget, photos, messages…
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              {[
                "Quelle est la prochaine étape ?",
                "Qui dois-je relancer ?",
                "Montre-moi les photos récentes",
                "Quel est l'état du budget ?",
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && messages.map((msg, idx) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2.5`}
          >
            {/* Avatar (assistant only) */}
            {msg.role === 'assistant' && (
              <div className="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-white" />
              </div>
            )}

            {/* Bubble */}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-br-sm'
                  : msg.agent_initiated
                  ? 'bg-indigo-50 text-indigo-900 border border-indigo-100 rounded-bl-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {msg.agent_initiated && msg.role === 'assistant' && (
                <div className="flex items-center gap-1 mb-1.5">
                  <Sparkles className="h-3 w-3 text-indigo-400" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">Proactif</span>
                </div>
              )}
              {/* Render content with basic newline support */}
              {(msg.content ?? '').split('\n').map((line, i, arr) => (
                <span key={i}>
                  {line}
                  {i < arr.length - 1 && <br />}
                </span>
              ))}
              <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-white/60' : 'text-gray-400'}`}>
                {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* Avatar (user only) */}
            {msg.role === 'user' && (
              <div className="shrink-0 w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-gray-500" />
              </div>
            )}
          </div>
        ))}

        {/* Sending indicator */}
        {sending && (
          <div className="flex justify-start items-end gap-2.5">
            <div className="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
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

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-xs text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 border-t border-gray-100 bg-white">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question… (Entrée pour envoyer)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all overflow-hidden"
            style={{ maxHeight: '120px', height: 'auto' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="shrink-0 h-11 w-11 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          L'agent IA ne peut envoyer des messages WhatsApp qu'après votre confirmation explicite.
        </p>
      </div>
    </div>
  );
}
