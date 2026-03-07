import { useState, useEffect, useRef } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { EMOJI_CHOICES, type CreateChantierPayload } from "@/types/chantier-dashboard";

interface ModalNouveauChantierProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: CreateChantierPayload) => Promise<void>;
}

export default function ModalNouveauChantier({
  open,
  onClose,
  onCreate,
}: ModalNouveauChantierProps) {
  const [nom, setNom] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [enveloppe, setEnveloppe] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset & focus à l'ouverture
  useEffect(() => {
    if (open) {
      setNom("");
      setEmoji("🏠");
      setEnveloppe("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Fermeture clavier (Échap)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleSubmit = async () => {
    const trimmedNom = nom.trim();
    if (!trimmedNom) {
      setError("Le nom du chantier est requis.");
      return;
    }
    const budget = parseFloat(enveloppe.replace(/\s/g, "").replace(",", "."));
    if (!enveloppe || isNaN(budget) || budget < 0) {
      setError("Veuillez saisir une enveloppe budgétaire valide.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onCreate({ nom: trimmedNom, emoji, enveloppePrevue: budget });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        aria-modal="true"
        role="dialog"
        aria-label="Nouveau chantier"
      >
        {/* Panneau */}
        <div className="relative w-full max-w-md bg-[#162035] border border-white/15 rounded-2xl shadow-2xl animate-scale-in">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5">
            <div>
              <h2 className="font-display font-bold text-white text-lg">Nouveau chantier</h2>
              <p className="text-xs text-slate-500 mt-0.5">Créez un nouveau projet de travaux</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-600 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-white/5"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Corps */}
          <div className="px-6 py-5 flex flex-col gap-5">

            {/* Champ nom */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Nom du chantier
              </label>
              <input
                ref={inputRef}
                type="text"
                value={nom}
                onChange={(e) => { setNom(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="Ex : Rénovation cuisine, Extension…"
                maxLength={80}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.07] transition-colors"
              />
            </div>

            {/* Sélecteur d'emoji */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Icône du projet
              </label>
              <div className="grid grid-cols-6 gap-2">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmoji(e)}
                    className={`flex items-center justify-center h-11 rounded-xl text-xl transition-all select-none ${
                      emoji === e
                        ? "bg-blue-500/20 border-2 border-blue-400/60 scale-105"
                        : "bg-white/5 border-2 border-transparent hover:bg-white/10 hover:border-white/20"
                    }`}
                    aria-label={`Choisir ${e}`}
                    aria-pressed={emoji === e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Enveloppe budgétaire */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Enveloppe budgétaire (€)
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={enveloppe}
                  onChange={(e) => { setEnveloppe(e.target.value); setError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                  placeholder="Ex : 80 000"
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.07] transition-colors"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">
                  €
                </span>
              </div>
            </div>

            {/* Message d'erreur */}
            {error && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !nom.trim() || !enveloppe}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Créer le chantier
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
