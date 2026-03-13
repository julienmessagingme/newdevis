import { useState, useEffect } from 'react';
import { Lightbulb, Loader2 } from 'lucide-react';
import type { LigneBudgetIA, EtapeRoadmap } from '@/types/chantier-ia';

interface ConseilsChantierProps {
  chantierId?: string | null;
  token?: string | null;
  lignesBudget?: LigneBudgetIA[];
  roadmap?: EtapeRoadmap[];
}

export default function ConseilsChantier({
  chantierId,
  token,
  lignesBudget = [],
  roadmap = [],
}: ConseilsChantierProps) {
  const [conseils, setConseils] = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  useEffect(() => {
    if (!chantierId || !token) {
      setLoading(false);
      return;
    }

    fetch('/api/chantier/conseils', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lignesBudget, roadmap }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (Array.isArray(data.conseils) && data.conseils.length > 0) {
          setConseils(data.conseils.slice(0, 3));
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierId, token]);

  return (
    <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl p-5">

      {/* En-tête */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Lightbulb className="h-4 w-4 text-amber-400" />
        </div>
        <h3 className="text-white font-semibold text-sm">Nos conseils pour votre chantier</h3>
      </div>

      {/* Corps */}
      {loading ? (
        <div className="flex items-center gap-2.5 text-slate-500 text-sm py-2">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Analyse de votre projet…</span>
        </div>
      ) : error || conseils.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Nos conseils ne sont pas disponibles pour le moment.
        </p>
      ) : (
        <ul className="space-y-3">
          {conseils.map((conseil, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-300 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-slate-300 text-sm leading-relaxed">{conseil}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
