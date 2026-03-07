import { useState, useEffect, useRef } from "react";
import { Pencil, Plus, X, Check, ExternalLink } from "lucide-react";
import {
  type ChantierDashboard,
  type DevisRattache,
  type PhaseChantier,
  PHASE_KEYS,
  PHASE_LABELS,
  STATUT_CONFIG,
  GAUGE_CIRCUMFERENCE,
  computeDashOffset,
  getJaugeColor,
} from "@/types/chantier-dashboard";

// ── Jauge circulaire SVG ───────────────────────────────────────────────────────
function CircularGauge({ pourcent }: { pourcent: number }) {
  const color = getJaugeColor(pourcent);
  const targetOffset = computeDashOffset(pourcent);
  const [currentOffset, setCurrentOffset] = useState(GAUGE_CIRCUMFERENCE); // départ vide
  const animatedRef = useRef(false);

  useEffect(() => {
    if (animatedRef.current) return;
    animatedRef.current = true;
    // Déclenche l'animation après 150ms (monte card d'abord)
    const t = setTimeout(() => setCurrentOffset(targetOffset), 150);
    return () => clearTimeout(t);
  }, [targetOffset]);

  return (
    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
      <svg width="70" height="70" viewBox="0 0 70 70" className="overflow-visible" aria-hidden>
        {/* Cercle de fond */}
        <circle
          cx="35" cy="35" r="27"
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="5"
        />
        {/* Cercle de remplissage animé */}
        <circle
          cx="35" cy="35" r="27"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={currentOffset}
          transform="rotate(-90 35 35)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1), stroke 0.3s" }}
        />
        {/* Texte central */}
        <text
          x="35" y="33"
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-display font-bold"
          style={{ fontFamily: '"Syne", system-ui, sans-serif', fontSize: 13, fill: "white", fontWeight: 700 }}
        >
          {pourcent}%
        </text>
        <text
          x="35" y="46"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 7, fill: "#94a3b8", fontFamily: '"DM Sans", system-ui, sans-serif' }}
        >
          consommé
        </text>
      </svg>
    </div>
  );
}

// ── Timeline horizontale ───────────────────────────────────────────────────────
function PhaseTimeline({ phase }: { phase: PhaseChantier }) {
  const currentIndex = PHASE_KEYS.indexOf(phase);

  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <div className="flex items-start gap-1">
        {PHASE_KEYS.map((key, i) => {
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;
          const isPending = i > currentIndex;

          return (
            <div key={key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              {/* Barre */}
              <div
                className={`h-1.5 w-full rounded-full transition-colors ${
                  isDone
                    ? "bg-green-500"
                    : isActive
                    ? "bg-blue-500 animate-pulse"
                    : isPending
                    ? "bg-white/10"
                    : ""
                }`}
              />
              {/* Label */}
              <span
                className={`text-[9px] text-center leading-tight truncate w-full text-center ${
                  isActive ? "text-blue-300 font-semibold" : isDone ? "text-green-400" : "text-slate-600"
                }`}
              >
                {PHASE_LABELS[key]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Ligne de devis ─────────────────────────────────────────────────────────────
function DevisRow({
  devis,
  onDetach,
}: {
  devis: DevisRattache;
  onDetach: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const cfg = STATUT_CONFIG[devis.statut] ?? STATUT_CONFIG.recu;

  return (
    <div
      className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.04] transition-colors group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Dot statut */}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />

      {/* Nom + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate leading-tight">{devis.nom}</p>
        <p className="text-[11px] text-slate-500 truncate">{devis.description}</p>
      </div>

      {/* Badge statut */}
      <span
        className={`hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${cfg.badge}`}
      >
        {cfg.label}
      </span>

      {/* Montant */}
      <span className="text-sm font-bold text-white flex-shrink-0 min-w-[56px] text-right">
        {devis.montant !== null
          ? `${devis.montant.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`
          : "— €"}
      </span>

      {/* Lien analyse (si existant) */}
      {devis.analyseId && (
        <a
          href={`/analyse/${devis.analyseId}`}
          className="text-slate-600 hover:text-cyan-400 transition-colors flex-shrink-0"
          title="Voir l'analyse"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      {/* Bouton détacher */}
      <button
        onClick={() => onDetach(devis.id)}
        className={`flex-shrink-0 text-slate-600 hover:text-red-400 transition-all ${
          hovered ? "opacity-100" : "opacity-0"
        }`}
        title="Retirer ce devis du chantier"
        aria-label={`Retirer ${devis.nom}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── ChantierCard ───────────────────────────────────────────────────────────────
interface ChantierCardProps {
  chantier: ChantierDashboard;
  delay?: number;
  onUpdate: (id: string, updates: { nom?: string; phase?: PhaseChantier }) => void;
  onDetachDevis: (chantierId: string, devisId: string) => void;
  onAddDevis: (chantierId: string) => void;
}

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function ChantierCard({
  chantier,
  delay = 0,
  onUpdate,
  onDetachDevis,
  onAddDevis,
}: ChantierCardProps) {
  const [editingNom, setEditingNom] = useState(false);
  const [nomDraft, setNomDraft] = useState(chantier.nom);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus auto sur l'input d'édition
  useEffect(() => {
    if (editingNom) inputRef.current?.focus();
  }, [editingNom]);

  const saveNom = () => {
    const trimmed = nomDraft.trim();
    if (trimmed && trimmed !== chantier.nom) {
      onUpdate(chantier.id, { nom: trimmed });
    }
    setEditingNom(false);
  };

  const margeRestante = chantier.enveloppePrevue - chantier.budgetEstimatif;

  return (
    <div
      className="bg-[#162035] border border-white/10 rounded-2xl p-5 flex flex-col gap-0 animate-fade-up hover:border-white/20 transition-colors"
      style={{ animationDelay: `${delay}s`, animationFillMode: "both" }}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 mb-4">
        {/* Emoji + Nom */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl flex-shrink-0 select-none">
            {chantier.emoji}
          </div>
          <div className="min-w-0 flex-1">
            {editingNom ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  value={nomDraft}
                  onChange={(e) => setNomDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNom();
                    if (e.key === "Escape") { setEditingNom(false); setNomDraft(chantier.nom); }
                  }}
                  className="flex-1 bg-white/5 border border-white/20 rounded-lg px-2.5 py-1 text-sm font-display font-bold text-white focus:outline-none focus:border-blue-500/60 min-w-0"
                />
                <button onClick={saveNom} className="text-green-400 hover:text-green-300">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => { setEditingNom(false); setNomDraft(chantier.nom); }} className="text-slate-500 hover:text-slate-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 cursor-pointer group/nom"
                onClick={() => setEditingNom(true)}
                title="Cliquer pour renommer"
              >
                <h3 className="font-display font-bold text-white text-base leading-tight truncate">
                  {chantier.nom}
                </h3>
                <Pencil className="h-3 w-3 text-slate-600 opacity-0 group-hover/nom:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            )}
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              {PHASE_LABELS[chantier.phase]}
            </p>
          </div>
        </div>

        {/* Jauge circulaire */}
        <CircularGauge pourcent={chantier.pourcentConsomme} />
      </div>

      {/* ── Lignes budget ── */}
      <div className="flex flex-col gap-1.5 mb-3">
        {/* Enveloppe prévue */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-white/30 flex-shrink-0" />
          <span className="text-slate-400 flex-1 min-w-0">Enveloppe prévue</span>
          <span className="font-semibold text-white">{fmt(chantier.enveloppePrevue)} €</span>
        </div>
        {/* Budget estimatif */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
          <span className="text-slate-400 flex-1 min-w-0">Budget estimatif</span>
          <span className="font-semibold text-blue-300">{fmt(chantier.budgetEstimatif)} €</span>
        </div>
        {/* Enveloppe validée */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
          <span className="text-slate-400 flex-1 min-w-0">Enveloppe validée</span>
          <span className="font-semibold text-green-300">{fmt(chantier.enveloppeValidee)} €</span>
        </div>
        {/* Reste à engager */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-white/15 flex-shrink-0" />
          <span className="text-slate-500 flex-1 min-w-0">Reste à engager</span>
          <span className={`font-semibold ${margeRestante < 0 ? "text-red-400" : "text-slate-400"}`}>
            {fmt(Math.abs(margeRestante))} {margeRestante < 0 ? "€ de dépassement" : "€"}
          </span>
        </div>
      </div>

      {/* ── Alerte dépassement ── */}
      {chantier.depassement && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs font-medium">
          <span className="flex-shrink-0">⚠️</span>
          <span>
            Budget estimatif proche de l'enveloppe —{" "}
            <span className="font-bold">
              {fmt(Math.max(0, chantier.enveloppePrevue - chantier.budgetEstimatif))} €
            </span>{" "}
            de marge restante
          </span>
        </div>
      )}

      {/* ── Liste des devis ── */}
      <div className="border-t border-white/5 pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Devis rattachés
          </p>
          <button
            onClick={() => onAddDevis(chantier.id)}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
          >
            <Plus className="h-3 w-3" />
            Ajouter
          </button>
        </div>

        {chantier.devis.length === 0 ? (
          // Zone drop vide
          <button
            onClick={() => onAddDevis(chantier.id)}
            className="w-full mt-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-white/10 hover:border-blue-500/40 hover:bg-blue-500/5 text-slate-600 hover:text-slate-400 text-xs transition-all"
          >
            <Plus className="h-4 w-4" />
            Glissez un devis ici ou cliquez pour en ajouter
          </button>
        ) : (
          <div className="flex flex-col -mx-1">
            {chantier.devis.map((d) => (
              <DevisRow
                key={d.id}
                devis={d}
                onDetach={(devisId) => onDetachDevis(chantier.id, devisId)}
              />
            ))}
            {/* Zone d'ajout si moins de 3 devis */}
            {chantier.devis.length < 3 && (
              <button
                onClick={() => onAddDevis(chantier.id)}
                className="mt-1 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5 text-slate-600 hover:text-slate-400 text-xs transition-all"
              >
                <Plus className="h-3 w-3" />
                Ajouter un devis
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Timeline des phases ── */}
      <PhaseTimeline phase={chantier.phase} />
    </div>
  );
}
