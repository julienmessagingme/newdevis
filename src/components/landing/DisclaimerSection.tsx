import { useState } from "react";
import { X } from "lucide-react";

const DisclaimerSection = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Version compacte ─────────────────────────────────── */}
      <div className="py-3 border-t border-slate-100 bg-transparent">
        <div className="container max-w-4xl flex items-center justify-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400">
            ℹ️ Analyse indicative — ne remplace pas un avis professionnel.
          </span>
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600 transition-colors"
          >
            En savoir plus
          </button>
        </div>
      </div>

      {/* ── Modal détail ─────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">⚠️ Avertissement important</h3>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5 text-sm text-slate-500 space-y-3 max-h-[70vh] overflow-y-auto">
              <p>
                L'analyse fournie par VerifierMonDevis.fr est <strong className="text-slate-700">automatisée</strong> et repose sur :
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>les informations figurant sur le devis transmis,</li>
                <li>des données publiques issues de sources administratives ou institutionnelles,</li>
                <li>des moyennes de prix observées sur le marché.</li>
              </ul>
              <p>
                Cette analyse constitue une <strong className="text-slate-700">aide à la décision</strong> et une <strong className="text-slate-700">information indicative</strong>.
              </p>
              <p>
                Elle <strong className="text-slate-700">ne constitue ni un avis juridique, ni un conseil professionnel, ni une expertise technique</strong>.
              </p>
              <p>
                VerifierMonDevis.fr <strong className="text-slate-700">n'évalue pas les artisans</strong> et ne porte aucun jugement sur leur probité ou leur compétence.
              </p>
              <p>
                Les résultats présentés ne sauraient se substituer à l'avis d'un professionnel du bâtiment ou à une vérification humaine approfondie.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DisclaimerSection;
