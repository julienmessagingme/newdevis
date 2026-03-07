import { FileText, Camera, Mail, Award, Clock } from "lucide-react";
import type { ActiviteRecente } from "@/types/chantier-dashboard";

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 2) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days}j`;
  return new Date(isoDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ── Actions rapides ───────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    icon: FileText,
    label: "Ajouter un devis à un chantier",
    href: "#devis",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  },
  {
    icon: Camera,
    label: "Ajouter une photo au journal",
    href: "#journal",
    color: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  },
  {
    icon: Mail,
    label: "Envoyer une relance artisan",
    href: "#relances",
    color: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  },
  {
    icon: Award,
    label: "Vérifier mes aides éligibles",
    href: "#aides",
    color: "bg-green-500/15 text-green-400 border-green-500/20",
  },
];

interface QuickActionsProps {
  onTabChange: (href: string) => void;
}

function QuickActions({ onTabChange }: QuickActionsProps) {
  return (
    <div className="bg-[#162035] border border-white/10 rounded-2xl p-5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-4">
        Actions rapides
      </p>
      <div className="flex flex-col gap-2">
        {QUICK_ACTIONS.map(({ icon: Icon, label, href, color }) => (
          <button
            key={href}
            onClick={() => onTabChange(href.replace("#", ""))}
            className="flex items-center gap-3 px-3 py-3 rounded-xl border border-transparent
              hover:bg-blue-500/5 hover:border-blue-500/25 transition-all text-left group"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors font-medium">
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Activité récente ──────────────────────────────────────────────────────────
interface ActiviteRecenteProps {
  items: ActiviteRecente[];
  loading?: boolean;
}

function ActiviteRecentePanel({ items, loading }: ActiviteRecenteProps) {
  return (
    <div className="bg-[#162035] border border-white/10 rounded-2xl p-5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-4">
        Activité récente
      </p>

      {loading ? (
        // Skeleton
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-white/10 flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-white/10 rounded w-3/4" />
                <div className="h-2.5 bg-white/5 rounded w-1/2" />
              </div>
              <div className="h-3 bg-white/10 rounded w-12" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Clock className="h-8 w-8 text-slate-700 mb-3" />
          <p className="text-slate-500 text-sm">Aucune activité pour le moment.</p>
          <p className="text-slate-600 text-xs mt-1">
            Commencez par ajouter un devis à un chantier !
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2 rounded-lg hover:bg-white/[0.03] px-1 transition-colors">
              {/* Dot coloré */}
              <span className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />

              {/* Label + sous-label */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{item.label}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {item.souslabel} · {relativeTime(item.createdAt)}
                </p>
              </div>

              {/* Montant */}
              {item.montant !== undefined && item.montant !== null && (
                <span className="text-sm font-bold text-white flex-shrink-0">
                  {fmt(item.montant)} €
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── BottomGrid (export principal) ─────────────────────────────────────────────
interface BottomGridProps {
  activite: ActiviteRecente[];
  activiteLoading?: boolean;
  onTabChange: (tab: string) => void;
  delay?: number;
}

export default function BottomGrid({
  activite,
  activiteLoading,
  onTabChange,
  delay = 0,
}: BottomGridProps) {
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-up"
      style={{ animationDelay: `${delay}s`, animationFillMode: "both" }}
    >
      <QuickActions onTabChange={onTabChange} />
      <ActiviteRecentePanel items={activite} loading={activiteLoading} />
    </div>
  );
}
