import type { ReactNode } from "react";

// Couleurs d'accent par variante
const VARIANT_CONFIG = {
  blue: {
    halo: "bg-blue-500/20",
    icon: "text-blue-400",
    border: "border-blue-500/10",
    value: "text-blue-100",
  },
  green: {
    halo: "bg-green-500/20",
    icon: "text-green-400",
    border: "border-green-500/10",
    value: "text-green-100",
  },
  orange: {
    halo: "bg-orange-500/20",
    icon: "text-orange-400",
    border: "border-orange-500/10",
    value: "text-orange-100",
  },
  gold: {
    halo: "bg-yellow-500/20",
    icon: "text-yellow-400",
    border: "border-yellow-500/10",
    value: "text-yellow-100",
  },
} as const;

type Variant = keyof typeof VARIANT_CONFIG;

interface KPICardPremiumProps {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  variant: Variant;
  /** Délai d'animation stagger (0.05s × index) */
  delay?: number;
}

export default function KPICardPremium({
  label,
  value,
  sub,
  icon,
  variant,
  delay = 0,
}: KPICardPremiumProps) {
  const cfg = VARIANT_CONFIG[variant];

  return (
    <div
      className={`relative overflow-hidden bg-[#162035] border ${cfg.border} border-white/10 rounded-xl p-5 animate-fade-up`}
      style={{ animationDelay: `${delay}s`, animationFillMode: "both" }}
    >
      {/* Halo coloré top-right */}
      <div
        className={`absolute -top-4 -right-4 w-24 h-24 rounded-full ${cfg.halo} blur-2xl pointer-events-none`}
        aria-hidden
      />

      {/* Header : label + icône */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </span>
        <span className={`${cfg.icon} opacity-80`}>{icon}</span>
      </div>

      {/* Valeur principale */}
      <p className={`font-display text-2xl font-bold ${cfg.value} leading-none`}>
        {value}
      </p>

      {/* Sous-valeur explicative */}
      {sub && (
        <p className="text-xs text-slate-500 mt-1.5 font-medium">{sub}</p>
      )}
    </div>
  );
}
