/**
 * src/components/analysis/OutcomeBanner.tsx
 *
 * 2026-08-24 — boucle de capture des issues (décision Johan).
 * Bannière « Ce devis, finalement ? » affichée au RETOUR sur une analyse de
 * plus de 7 jours dont l'issue est inconnue. 4 choix à un clic → POST
 * /api/analyse/[id]/outcome (source 'banner'). Complémentaire de l'email J+15
 * (vmd-outcome-scheduler). La donnée alimente analysis_outcomes — ce qui rend
 * l'Observatoire prédictif (taux de signature par verdict / niveau de prix).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const MIN_AGE_MS = 7 * 24 * 3600 * 1000;

const CHOICES: Array<{ value: string; label: string; cls: string }> = [
  { value: "signe_tel_quel", label: "✅ Signé tel quel", cls: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" },
  { value: "signe_apres_negociation", label: "🤝 Signé après négociation", cls: "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100" },
  { value: "non_signe", label: "❌ Pas signé", cls: "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100" },
  { value: "hesite", label: "🤔 J'hésite encore", cls: "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100" },
];

interface Props {
  analysisId: string;
  createdAt: string;
}

export default function OutcomeBanner({ analysisId, createdAt }: Props) {
  const [visible, setVisible] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [pendingRemise, setPendingRemise] = useState(false);
  const [remise, setRemise] = useState("");
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    const age = Date.now() - new Date(createdAt).getTime();
    if (!Number.isFinite(age) || age < MIN_AGE_MS) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const t = session?.access_token;
      if (!t) return;
      try {
        const res = await fetch(`/api/analyse/${analysisId}/outcome`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && !data?.outcome) {
          setToken(t);
          setVisible(true);
        }
      } catch { /* silencieux — la bannière est un bonus */ }
    })();
    return () => { cancelled = true; };
  }, [analysisId, createdAt]);

  if (!visible) return null;

  const send = async (outcome: string, remiseMontant?: number) => {
    try {
      await fetch(`/api/analyse/${analysisId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ outcome, ...(remiseMontant !== undefined ? { remise_montant: remiseMontant } : {}) }),
      });
    } catch { /* silencieux */ }
    setThanks(true);
    setTimeout(() => setVisible(false), 3500);
  };

  const onChoice = (value: string) => {
    if (value === "signe_apres_negociation") {
      setPendingRemise(true);
      return;
    }
    void send(value);
  };

  if (thanks) {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-6 py-4 text-center text-[14.5px] text-emerald-900">
        Merci, c'est noté ! Votre réponse enrichit nos statistiques publiques. 🙏
      </div>
    );
  }

  if (pendingRemise) {
    return (
      <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/60 px-6 py-5">
        <p className="text-[14.5px] font-medium text-blue-900 mb-3">
          Bravo pour la négociation 👏 — combien avez-vous obtenu de remise ? <span className="font-normal text-blue-700/70">(facultatif)</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Montant en €"
            value={remise}
            onChange={(e) => setRemise(e.target.value)}
            className="w-36 rounded-lg border border-blue-300 px-3 py-2 text-[14px]"
          />
          <button
            type="button"
            onClick={() => {
              const n = parseFloat(remise);
              void send("signe_apres_negociation", Number.isFinite(n) && n >= 0 ? n : undefined);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-blue-700"
          >
            Envoyer
          </button>
          <button
            type="button"
            onClick={() => void send("signe_apres_negociation")}
            className="text-[13px] text-blue-700/70 underline"
          >
            Je préfère ne pas dire
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card px-6 py-5">
      <p className="text-[15px] font-semibold text-foreground mb-1">Ce devis, finalement ?</p>
      <p className="text-[13px] text-foreground/60 mb-3.5">
        Un clic suffit — votre réponse enrichit nos statistiques publiques et aide d'autres particuliers à négocier.
      </p>
      <div className="flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChoice(c.value)}
            className={`rounded-lg border px-3.5 py-2 text-[13.5px] font-medium transition-colors ${c.cls}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
