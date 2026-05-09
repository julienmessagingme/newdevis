import { useState, useEffect, useRef } from 'react';
import { X, Loader2, ArrowRight } from 'lucide-react';
import type { ChantierIAResult, DocumentChantier, LotChantier } from '@/types/chantier-ia';
import { ExpertAvatar } from '@/components/chantier/MATERIAL_IMAGES';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li style="margin-left:1rem;list-style:disc">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  'Quelles démarches administratives sont nécessaires ?',
  'Quels travaux dois-je réaliser en premier ?',
  'Y a-t-il des économies possibles sur mon budget ?',
  'Suis-je éligible à des aides ou subventions (éco-PTZ, CEE, MaPrimeRénov…) ?',
  'Quel type de contrat demander à mes artisans ?',
  'Comment éviter les mauvaises surprises sur ce chantier ?',
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatDrawer({ isOpen, onClose, result, documents, lots, token }: {
  isOpen: boolean;
  onClose: () => void;
  result: ChantierIAResult;
  documents: DocumentChantier[];
  lots: LotChantier[];
  token: string | null | undefined;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  // Greeting on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Bonjour\u00a0! Je suis votre ma\u00eetre d\u2019\u0153uvre pour le projet **${result.nom}**.\n\nComment puis-je vous aider\u00a0? Voici quelques questions fr\u00e9quentes, ou posez directement la v\u00f4tre ci-dessous.`,
      }]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput('');
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch('/api/chantier/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: trimmed,
          history,
          context: {
            nom: result.nom,
            description: result.description,
            typeProjet: result.typeProjet,
            budgetTotal: result.budgetTotal,
            dureeEstimeeMois: result.dureeEstimeeMois,
            lignesBudget: result.lignesBudget?.map(l => ({ label: l.label, montant: l.montant })),
            lots: lots.map(l => ({ nom: l.nom, statut: l.statut, budget_min_ht: l.budget_min_ht, budget_avg_ht: l.budget_avg_ht, budget_max_ht: l.budget_max_ht })),
            formalites: result.formalites?.map(f => ({ nom: f.nom, detail: f.detail, obligatoire: f.obligatoire })),
            aides: result.aides?.map(a => ({ nom: a.nom, detail: a.detail, montant: a.montant, eligible: a.eligible })),
            roadmap: result.roadmap?.map(e => ({ nom: e.nom ?? '', detail: (e as any).detail ?? '', mois: (e as any).mois ?? '', isCurrent: (e as any).isCurrent ?? false })),
            prochaineAction: result.prochaineAction,
          },
          documents: documents.map(d => ({ name: d.nom, type: d.document_type })),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? 'Désolé, je n\u2019ai pas pu répondre.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erreur de connexion. Veuillez réessayer.' }]);
    } finally {
      setSending(false);
    }
  }

  const showSuggestions = messages.filter(m => m.role === 'user').length === 0 && !sending;

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />}
      <div className={`fixed top-0 right-0 h-full w-full max-w-[420px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <ExpertAvatar size={40} showBadge />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-tight">Maître d'œuvre</p>
            <p className="text-[11px] text-emerald-500 font-semibold">● En ligne</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              {msg.role === 'assistant' && (
                <div className="shrink-0 mt-0.5"><ExpertAvatar size={28} /></div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-sm'
              }`}>
                {msg.role === 'assistant'
                  ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  : msg.content
                }
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {sending && (
            <div className="flex gap-2.5">
              <div className="shrink-0 mt-0.5"><ExpertAvatar size={28} /></div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1">
                {[0, 150, 300].map(delay => (
                  <div key={delay} className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* Suggested questions */}
          {showSuggestions && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Questions fréquentes</p>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => send(q)}
                  className="w-full text-left px-4 py-2.5 rounded-xl bg-white border border-gray-100 hover:border-blue-200 hover:bg-blue-50 text-sm text-gray-700 hover:text-blue-700 transition-all shadow-sm"
                >
                  {q} →
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Posez votre question…"
              disabled={sending}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:opacity-50"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
