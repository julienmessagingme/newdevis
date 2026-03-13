import { useState, useCallback, useEffect } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import type { ChantierIAResult, DocumentChantier } from '@/types/chantier-ia';
import { calcBudgetFromDocuments } from '@/utils/chantier/calcBudgetFromDocuments';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Transforme **gras** en <strong> pour rendu inline. */
function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>,
  );
}

/** Synthèse locale immédiate — calculée depuis les props, sans appel réseau. */
function buildLocalSynthese(result: ChantierIAResult, nbDocs: number): string {
  const budget   = result.budgetTotal.toLocaleString('fr-FR');
  const duree    = result.dureeEstimeeMois;
  const nbLots   = result.lignesBudget?.length ?? 0;
  const current  = result.roadmap?.find((e) => e.isCurrent);
  const urgentes = (result.taches ?? []).filter((t) => !t.done && t.priorite === 'urgent').length;

  let text =
    `Votre chantier **${result.nom}** représente **${budget} €** sur **${duree} mois** avec **${nbLots} lot${nbLots > 1 ? 's' : ''}** de travaux.`;

  if (current) {
    text += ` La phase en cours est **${current.nom}** — ${current.detail}.`;
  }

  if (nbDocs > 0) {
    text += ` **${nbDocs} document${nbDocs > 1 ? 's' : ''}** ajouté${nbDocs > 1 ? 's' : ''} au dossier.`;
  }

  if (urgentes > 0) {
    text += ` ⚠ **${urgentes} tâche${urgentes > 1 ? 's' : ''} urgente${urgentes > 1 ? 's' : ''}** à traiter en priorité.`;
  } else {
    text += ` Aucune urgence détectée — continuez le suivi régulier.`;
  }

  return text;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SyntheseChantierProps {
  result:      ChantierIAResult;
  chantierId?: string | null;
  token?:      string | null;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SyntheseChantier({ result, chantierId, token }: SyntheseChantierProps) {
  const [synthese, setSynthese]   = useState<string>('');
  const [loading, setLoading]     = useState(false);
  const [isAI, setIsAI]           = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // ── Synthèse locale au mount ─────────────────────────────────────────────
  useEffect(() => {
    setSynthese(buildLocalSynthese(result, 0));
    setIsAI(false);
  }, [result]);

  // ── Régénération IA ──────────────────────────────────────────────────────
  const regenerer = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch documents si disponible
      let docs: DocumentChantier[] = [];
      if (chantierId && token) {
        try {
          const res = await fetch(`/api/chantier/${chantierId}/documents`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            docs = (data.documents ?? []) as DocumentChantier[];
          }
        } catch {
          // non-bloquant : on continue sans les documents
        }
      }

      // 2. Calcul budget depuis documents
      const budget   = calcBudgetFromDocuments(result.lignesBudget ?? [], docs);
      const nbDevis  = docs.filter((d) => d.document_type === 'devis').length;
      const nbFact   = docs.filter((d) => d.document_type === 'facture').length;
      const nbPhotos = docs.filter((d) => d.document_type === 'photo').length;
      const nbAutres = docs.filter((d) => !['devis','facture','photo'].includes(d.document_type)).length;

      // 3. Appel API synthèse
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/chantier/synthese', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          nom:              result.nom,
          budgetTotal:      result.budgetTotal,
          dureeEstimeeMois: result.dureeEstimeeMois,
          lignesBudget:     result.lignesBudget ?? [],
          roadmap:          result.roadmap ?? [],
          nbDocuments:      docs.length,
          docBreakdown:     { devis: nbDevis, factures: nbFact, photos: nbPhotos, autres: nbAutres },
          totalEngage:      budget.totalEngage,
          totalPaye:        budget.totalPaye,
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      if (!data.synthese) throw new Error('Réponse vide');

      setSynthese(data.synthese);
      setIsAI(true);
      setLastUpdated(new Date());

    } catch (e) {
      setError('Impossible de générer la synthèse. La version locale est affichée.');
      // Garder la synthèse locale précédente
    } finally {
      setLoading(false);
    }
  }, [loading, chantierId, token, result]);

  if (!synthese) return null;

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/40 to-indigo-950/40 p-4 mb-1">

      {/* En-tête */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
            Synthèse du chantier
          </span>
          {isAI && (
            <span className="text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-full px-1.5 py-0.5 font-medium">
              mise à jour
            </span>
          )}
        </div>

        <button
          onClick={regenerer}
          disabled={loading}
          title="Actualiser la synthèse"
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors group"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
          <span>{loading ? 'Génération…' : 'Régénérer'}</span>
        </button>
      </div>

      {/* Corps */}
      {loading ? (
        <div className="space-y-2">
          <div className="h-3.5 bg-white/[0.06] rounded-full animate-pulse w-full" />
          <div className="h-3.5 bg-white/[0.06] rounded-full animate-pulse w-5/6" />
          <div className="h-3.5 bg-white/[0.06] rounded-full animate-pulse w-3/4" />
        </div>
      ) : (
        <p className="text-slate-300 text-sm leading-relaxed">
          {renderBold(synthese)}
        </p>
      )}

      {/* Erreur non-bloquante */}
      {error && !loading && (
        <p className="mt-2 text-xs text-amber-500/70">{error}</p>
      )}

      {/* Horodatage */}
      {lastUpdated && !loading && (
        <p className="mt-2 text-[11px] text-slate-700">
          Actualisé à {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}
