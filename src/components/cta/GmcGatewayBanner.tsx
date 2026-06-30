/**
 * src/components/cta/GmcGatewayBanner.tsx
 *
 * Passerelle VMD → GérerMonChantier.
 * À placer après le verdict d'analyse, dans les guides, sur le blog, etc.
 *
 * Variantes :
 *   - "post-analysis" : après une analyse réussie (chemin chaud)
 *   - "guide"         : dans les guides SEO (chemin froid)
 *   - "blog"          : en fin d'article blog
 *   - "compact"       : version courte pour barre latérale
 */

import { ArrowRight, Wrench, Calendar, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

type Variant = "post-analysis" | "guide" | "blog" | "compact";

interface Props {
  variant?: Variant;
  className?: string;
}

const GMC_BASE = "https://www.gerermonchantier.fr";

function buildUrl(variant: Variant): string {
  const utm = new URLSearchParams({
    utm_source: "vmd",
    utm_medium: "banner",
    utm_campaign: `gateway_${variant}`,
  });
  return `${GMC_BASE}/beta?${utm.toString()}`;
}

const COPY: Record<Variant, { title: string; body: string; cta: string }> = {
  "post-analysis": {
    title: "Votre devis est vérifié. Et maintenant ?",
    body: "Le devis n'est que l'étape 1. Une fois signé, pilotez vos artisans, suivez votre budget en temps réel et coordonnez votre planning depuis un seul tableau de bord.",
    cta: "Tester GérerMonChantier — gratuit 30 jours",
  },
  guide: {
    title: "Une fois le devis signé, le vrai chantier commence",
    body: "Garder le contrôle sur le budget, les artisans, les retards. C'est ce que fait GérerMonChantier — pensé par les mêmes experts que VerifierMonDevis.",
    cta: "Découvrir GérerMonChantier",
  },
  blog: {
    title: "Vous lisez VMD ? Découvrez son extension chantier.",
    body: "GérerMonChantier prolonge l'expertise VMD jusqu'au pilotage opérationnel : budget, planning, artisans, paiements échelonnés.",
    cta: "Voir GérerMonChantier",
  },
  compact: {
    title: "Pilotez votre chantier",
    body: "Continuez avec GérerMonChantier.",
    cta: "Découvrir",
  },
};

export default function GmcGatewayBanner({ variant = "guide", className = "" }: Props) {
  const copy = COPY[variant];
  const url = buildUrl(variant);

  if (variant === "compact") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block bg-accent border border-primary/20 rounded-lg p-4 hover:border-primary transition-colors ${className}`}
      >
        <div className="flex items-start gap-3">
          <Wrench className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{copy.title}</div>
            <div className="text-xs text-muted-foreground mt-1">{copy.body}</div>
            <div className="text-xs text-primary font-medium mt-2 flex items-center gap-1">
              {copy.cta} <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </a>
    );
  }

  return (
    <div
      className={`bg-gradient-to-br from-primary/5 via-accent to-primary/10 border border-primary/20 rounded-xl p-6 md:p-7 ${className}`}
    >
      <div className="grid md:grid-cols-[1fr_auto] gap-6 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-primary mb-2">
            <Wrench className="h-3.5 w-3.5" /> GérerMonChantier
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-foreground tracking-tight mb-2">
            {copy.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4 md:mb-0">{copy.body}</p>
          {variant === "post-analysis" && (
            <div className="flex flex-wrap gap-3 mt-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5 text-primary" /> Budget en temps réel
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Planning des artisans
              </span>
              <span className="inline-flex items-center gap-1">
                <Wrench className="h-3.5 w-3.5 text-primary" /> Coordination centralisée
              </span>
            </div>
          )}
        </div>
        <div className="flex md:flex-col gap-2 md:gap-3 md:items-end">
          <Button asChild size="lg" className="whitespace-nowrap">
            <a href={url} target="_blank" rel="noopener noreferrer">
              {copy.cta} <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
          {variant === "post-analysis" && (
            <span className="text-[11px] text-muted-foreground text-center md:text-right">
              Gratuit 30 jours · Aucune CB requise
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
