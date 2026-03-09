import { useState, useRef, useEffect } from 'react';
import { Send, ArrowLeft, Wand2 } from 'lucide-react';
import type { ChantierIAResult, ChangeItem, ArtisanIA, FormaliteIA, TacheIA } from '@/types/chantier-ia';

interface ScreenAmeliorationsProps {
  result: ChantierIAResult;
  chantierId: string;
  token: string;
  onBack: () => void;
  onUpdate: (updated: ChantierIAResult) => void;
}

const SUGGESTIONS = [
  '+ Je veux aussi un spa',
  'Réduire à 15 000 €',
  'Démarrage en septembre 2026',
  'Ajouter une pergola bioclimatique',
  'Trouver des aides supplémentaires',
];

interface Message {
  role: 'user' | 'ai';
  text?: string;
  changes?: ChangeItem[];
  typing?: boolean;
}

export default function ScreenAmeliorations({
  result,
  chantierId,
  token,
  onBack,
  onUpdate,
}: ScreenAmeliorationsProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      text: `Votre plan **${result.nom}** est prêt ! 🎉\n\nVous pouvez me demander d'ajuster n'importe quel aspect : budget, artisans, formalités, dates de démarrage… Je mets votre plan à jour instantanément.`,
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg = text.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }, { role: 'ai', typing: true }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chantier/ameliorer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chantierId, modification: userMsg }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'ai', text: `❌ ${data.error ?? 'Erreur lors de la mise à jour'}` },
        ]);
        return;
      }

      // Mettre à jour le result local
      const updated: ChantierIAResult = { ...result };
      if (data.updatedFields?.budgetTotal) updated.budgetTotal = data.updatedFields.budgetTotal;
      if (data.updatedFields?.dureeEstimeeMois) updated.dureeEstimeeMois = data.updatedFields.dureeEstimeeMois;
      if (data.updatedFields?.nbArtisans) updated.nbArtisans = data.updatedFields.nbArtisans;
      if (data.newArtisans?.length) {
        updated.artisans = [...(updated.artisans ?? []), ...(data.newArtisans as ArtisanIA[])];
        updated.nbArtisans = updated.artisans.length;
      }
      if (data.newFormalites?.length) {
        updated.formalites = [...(updated.formalites ?? []), ...(data.newFormalites as FormaliteIA[])];
        updated.nbFormalites = (updated.formalites ?? []).length;
      }
      if (data.newTaches?.length) {
        updated.taches = [...(updated.taches ?? []), ...(data.newTaches as TacheIA[])];
      }
      onUpdate(updated);

      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'ai', text: data.message, changes: data.changes },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'ai', text: '❌ Erreur réseau, veuillez réessayer.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const renderText = (text: string) => {
    // Markdown bold et sauts de ligne
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-4 bg-[#0d1525] border-b border-white/[0.05]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-blue-400" />
          <span className="text-white font-medium text-sm">Amélioration IA</span>
        </div>
        <div className="text-lg">{result.emoji}</div>
      </header>

      {/* Layout 2 colonnes sur desktop */}
      <div className="flex flex-1 overflow-hidden">

        {/* Panneau gauche : résumé modifications */}
        <aside className="hidden lg:block w-72 shrink-0 bg-[#0d1525] border-r border-white/[0.05] overflow-y-auto p-4">
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-4">Modifications appliquées</p>

          {/* Stats actuelles */}
          <div className="space-y-2 mb-6">
            {[
              { label: 'Budget', value: `${result.budgetTotal.toLocaleString('fr-FR')} €`, icon: '💰' },
              { label: 'Durée', value: `${result.dureeEstimeeMois} mois`, icon: '🗓️' },
              { label: 'Artisans', value: String(result.nbArtisans), icon: '👷' },
              { label: 'Formalités', value: String(result.nbFormalites), icon: '📋' },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{s.icon}</span>
                  <span className="text-slate-400 text-xs">{s.label}</span>
                </div>
                <span className="text-white text-sm font-semibold">{s.value}</span>
              </div>
            ))}
          </div>

          {/* Liste des changes appliquées */}
          {messages.filter((m) => m.changes?.length).length > 0 && (
            <div>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-3">Historique</p>
              <div className="space-y-2">
                {messages
                  .filter((m) => m.changes?.length)
                  .flatMap((m) => m.changes ?? [])
                  .map((c, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 bg-emerald-500/[0.07] border border-emerald-500/15 rounded-xl px-3 py-2"
                      style={{ animation: 'ia-fade-up 0.3s ease-out both' }}
                    >
                      <span className="text-lg shrink-0">{c.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-emerald-200 text-xs font-medium">{c.what}</p>
                        <p className="text-emerald-600 text-xs leading-tight mt-0.5">{c.detail}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </aside>

        {/* Zone de chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'ai' && (
                  <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/25 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <Wand2 className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-[#0d1525] border border-white/[0.06] text-slate-200 rounded-tl-sm'
                  }`}
                >
                  {msg.typing ? (
                    <div className="flex gap-1 items-center py-1">
                      {[0, 1, 2].map((d) => (
                        <div
                          key={d}
                          className="w-1.5 h-1.5 rounded-full bg-slate-400"
                          style={{ animation: `ia-typing-dot 1.2s ease-in-out ${d * 0.2}s infinite` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      {msg.text && (
                        <p
                          dangerouslySetInnerHTML={{ __html: renderText(msg.text) }}
                          className="whitespace-pre-wrap"
                        />
                      )}
                      {/* Changes list dans le chat */}
                      {msg.changes && msg.changes.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {msg.changes.map((c, ci) => (
                            <div
                              key={ci}
                              className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2"
                            >
                              <span className="shrink-0">{c.emoji}</span>
                              <div>
                                <p className="text-emerald-200 text-xs font-medium">{c.what}</p>
                                <p className="text-emerald-500 text-xs">{c.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          <div className="px-4 sm:px-6 py-3 border-t border-white/[0.04]">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="shrink-0 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-slate-400 hover:text-white rounded-full px-3 py-1.5 text-xs transition-all whitespace-nowrap"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-4 sm:px-6 py-4 bg-[#0d1525] border-t border-white/[0.05]">
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Demandez une modification… (Ex: + Ajouter un spa, réduire à 15k€)"
                disabled={isLoading}
                className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-3 text-white placeholder-slate-600 text-sm outline-none focus:border-blue-500/40 transition-all disabled:opacity-50"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all shrink-0"
              >
                <Send className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
