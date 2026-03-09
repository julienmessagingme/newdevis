import { Plus, Sparkles } from "lucide-react";

interface AddChantierCardProps {
  onClick?: () => void;
  delay?: number;
}

export default function AddChantierCard({ delay = 0 }: AddChantierCardProps) {
  return (
    <a
      href="/mon-chantier/nouveau"
      className="group flex flex-col items-center justify-center gap-3 bg-[#162035]/60
        border-2 border-dashed border-blue-500/25 hover:border-blue-400/50
        hover:bg-blue-500/5 rounded-2xl p-8 transition-all cursor-pointer animate-fade-up
        min-h-[160px] no-underline"
      style={{ animationDelay: `${delay}s`, animationFillMode: "both" }}
      aria-label="Créer un nouveau chantier avec l'IA"
    >
      {/* Icône "+" dans cercle teinté */}
      <div className="w-12 h-12 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center transition-transform group-hover:scale-110 relative">
        <Plus className="h-6 w-6 text-blue-400" />
        <Sparkles className="h-3 w-3 text-cyan-400 absolute -top-0.5 -right-0.5" />
      </div>

      {/* Texte */}
      <div className="text-center">
        <p className="font-display font-bold text-blue-300 text-sm group-hover:text-blue-200 transition-colors">
          Nouveau chantier IA
        </p>
        <p className="text-xs text-slate-600 mt-0.5 group-hover:text-slate-500 transition-colors">
          Plan complet généré en 10 secondes
        </p>
      </div>
    </a>
  );
}
