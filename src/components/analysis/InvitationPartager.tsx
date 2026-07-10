/**
 * src/components/analysis/InvitationPartager.tsx
 *
 * Bible Produit VMD — invitation discrète au partage.
 * Un seul bouton. Utilise navigator.share() natif, fallback silencieux
 * vers copie du lien.
 *
 * Placée après « Ce qui nous a menés à cet avis », pour capter le moment
 * de gratitude sans le forcer.
 */

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

const SHARE_URL = "https://www.verifiermondevis.fr";

const SHARE_TEXT =
  "Si tu attends ou reçois un devis de travaux, ce site l'a relu pour moi et m'a même préparé la discussion à avoir avec l'artisan. Ça t'évitera peut-être une mauvaise surprise :";

export default function InvitationPartager() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const payload = {
      title: "VerifierMonDevis",
      text: SHARE_TEXT,
      url: SHARE_URL,
    };

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // L'utilisateur a annulé — pas d'erreur à afficher.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT} ${SHARE_URL}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Silencieux — pas de bruit UX.
    }
  };

  return (
    <section className="mt-6 px-6 md:px-8 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-[15.5px] font-medium text-foreground/85">
            Un proche a un chantier en cours&nbsp;?
          </p>
          <p className="mt-1 text-sm text-foreground/60 leading-relaxed">
            Ce service peut lui rendre le même travail, en cinq minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/50 px-4 py-2 text-sm text-foreground hover:bg-background transition-colors whitespace-nowrap"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              Lien copié
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Partager le lien
            </>
          )}
        </button>
      </div>
    </section>
  );
}
