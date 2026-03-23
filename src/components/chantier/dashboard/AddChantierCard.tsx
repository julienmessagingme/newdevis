import { Plus, Sparkles } from "lucide-react";

interface AddChantierCardProps {
  delay?: number;
}

export default function AddChantierCard({ delay = 0 }: AddChantierCardProps) {
  return (
    <a
      href="/mon-chantier/nouveau"
      className="group flex flex-col items-center justify-center gap-3
        bg-white border-2 border-dashed border-blue-200
        hover:border-blue-400 hover:bg-blue-50/30
        rounded-2xl p-8 transition-all cursor-pointer animate-fade-up
        min-h-[160px] no-underline"
      style={{ animationDelay: `${delay}s`, animationFillMode: "both" }}
      aria-label="Créer un nouveau chantier"
    >
      {/* Icône "+" */}
      <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center transition-transform group-hover:scale-110 relative">
        <Plus className="h-6 w-6 text-blue-600" />
        <Sparkles className="h-3 w-3 text-cyan-500 absolute -top-0.5 -right-0.5" />
      </div>

      {/* Texte */}
      <div className="text-center">
        <p className="font-display font-bold text-blue-600 text-sm group-hover:text-blue-700 transition-colors">
          Nouveau chantier
        </p>
        <p className="text-xs text-gray-400 mt-0.5 group-hover:text-gray-500 transition-colors">
          Plan complet généré en quelques secondes
        </p>
      </div>
    </a>
  );
}
