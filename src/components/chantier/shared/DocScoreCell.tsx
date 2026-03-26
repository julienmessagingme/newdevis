import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentChantier } from '@/types/chantier-ia';

// ── Score config ────────────────────────────────────────────────────────────

type ScoreText = 'VERT' | 'ORANGE' | 'ROUGE';
type ScoreNum = number | null | undefined;

const SCORE_CFG: Record<ScoreText, { cls: string; dot: string; label: string }> = {
  VERT:   { cls: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', dot: 'bg-emerald-500', label: '✅ Bon' },
  ORANGE: { cls: 'bg-amber-50 text-amber-700 hover:bg-amber-100',     dot: 'bg-amber-500',   label: '⚠️ Moyen' },
  ROUGE:  { cls: 'bg-red-50 text-red-600 hover:bg-red-100',           dot: 'bg-red-500',     label: '🔴 Risqué' },
};

function numericToText(score: ScoreNum): ScoreText | null {
  if (score == null) return null;
  return score >= 70 ? 'VERT' : score >= 45 ? 'ORANGE' : 'ROUGE';
}

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  doc: DocumentChantier;
  chantierId?: string;
  token?: string | null;
  /** Score as TEXT ('VERT'|'ORANGE'|'ROUGE') or numeric (0-100) */
  score?: ScoreText | ScoreNum;
  onAnalysed?: (docId: string, analyseId: string) => void;
  /** Show as compact dot+label (for tables) vs full badge */
  variant?: 'badge' | 'dot';
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DocScoreCell({ doc, chantierId, token, score, onAnalysed, variant = 'badge' }: Props) {
  const analyseHref = doc.analyse_id
    ? `/analyse/${doc.analyse_id}?from=chantier&chantierId=${chantierId}`
    : undefined;

  // Normalize score
  const scoreText: ScoreText | null =
    typeof score === 'string' && (score === 'VERT' || score === 'ORANGE' || score === 'ROUGE')
      ? score
      : numericToText(score as ScoreNum);

  const cfg = scoreText ? SCORE_CFG[scoreText] : null;

  // ── Analyzed with score ─────────────────────────────────────────────────
  if (cfg) {
    const badge = variant === 'dot' ? (
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="text-[11px] font-semibold">Voir →</span>
      </span>
    ) : (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${cfg.cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    );
    return analyseHref
      ? <a href={analyseHref} className="hover:underline transition-colors">{badge}</a>
      : badge;
  }

  // ── Analyzed but no score yet ───────────────────────────────────────────
  if (doc.analyse_id && analyseHref) {
    return (
      <a href={analyseHref}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-700 hover:underline transition-colors">
        Voir l'analyse →
      </a>
    );
  }

  // ── Not analyzed: show ⚡ Analyser for devis ────────────────────────────
  if (doc.document_type === 'devis' && chantierId && token) {
    return <AnalyseButton docId={doc.id} chantierId={chantierId} token={token} onAnalysed={onAnalysed} />;
  }

  // ── Facture / other without analysis ────────────────────────────────────
  return <span className="text-[11px] text-gray-300 italic">—</span>;
}

// ── Inline Analyse Button ───────────────────────────────────────────────────

function AnalyseButton({ docId, chantierId, token, onAnalysed }: {
  docId: string;
  chantierId: string;
  token: string;
  onAnalysed?: (docId: string, analyseId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}/analyser`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok || res.status === 409) {
        const analysisId: string = data.analysisId;
        if (analysisId) {
          setResultId(analysisId);
          onAnalysed?.(docId, analysisId);
          toast.success('Analyse lancée — résultat dans quelques secondes');
        }
      } else {
        toast.error(`Erreur : ${data.error ?? res.status}`);
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  if (resultId) {
    return (
      <a href={`/analyse/${resultId}?from=chantier&chantierId=${chantierId}`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors">
        ✓ Voir le résultat →
      </a>
    );
  }

  return (
    <button onClick={handleClick} disabled={busy}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 px-2 py-1 rounded-lg transition-colors whitespace-nowrap">
      {busy ? <><Loader2 className="h-3 w-3 animate-spin" /> Analyse…</> : '⚡ Analyser'}
    </button>
  );
}
