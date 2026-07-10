/**
 * src/components/analysis/AvisSurLeDevis.tsx
 *
 * Hero de l'analyse — Bible Produit VMD, bloc 1.
 * Répond en 5 secondes à la question : « Que retenir de ce devis ? »
 *
 * Trois variations principales (cohérent / négociable / à risque),
 * plus les cas de bypass (devis étranger, estimation courtier, incomplet,
 * hors-scope, prestation intellectuelle) et le hard block company_status.
 *
 * Aucun emoji couleur, aucun badge, aucun chiffre isolé en grande typo.
 * Le fond de carte porte le signal chromatique (menthe / ambre / rose pâle).
 */

import type { ConclusionData } from "@/lib/analyse/conclusionTypes";

type Tone = "calm" | "amber" | "alert";

interface ToneStyle {
  container: string;
  title: string;
}

const TONE_STYLES: Record<Tone, ToneStyle> = {
  calm: {
    container: "bg-emerald-50/70 border-emerald-200/70",
    title: "text-emerald-950",
  },
  amber: {
    container: "bg-amber-50/70 border-amber-200/70",
    title: "text-amber-950",
  },
  alert: {
    container: "bg-rose-50/70 border-rose-200/70",
    title: "text-rose-950",
  },
};

function toneFor(conclusion: ConclusionData): Tone {
  if (conclusion.verdict_decisionnel === "signer") return "calm";
  if (conclusion.verdict_decisionnel === "signer_avec_negociation") return "amber";
  return "alert";
}

/** Arrondi doux : « aux alentours de 400 € » plutôt que « 421 € ». */
function softRound(n: number): number {
  if (n < 100) return Math.round(n / 10) * 10;
  if (n < 1000) return Math.round(n / 50) * 50;
  if (n < 10000) return Math.round(n / 100) * 100;
  return Math.round(n / 500) * 500;
}

function fmtEUR(n: number): string {
  return `${n.toLocaleString("fr-FR")} €`;
}

interface AvisSurLeDevisProps {
  conclusion: ConclusionData;
  /** Nombre de prestations effectivement comparées (issue du moteur, optionnel). */
  comparableCount?: number | null;
  /** Nombre total de prestations du devis (optionnel). */
  totalCount?: number | null;
  /** Motifs critiques (criteres_rouges) issus du scoring, pour le hard block. */
  criticalReasons?: string[];
}

export default function AvisSurLeDevis({
  conclusion,
  comparableCount,
  totalCount,
  criticalReasons = [],
}: AvisSurLeDevisProps) {
  // ── Cas de bypass : le devis n'est pas comparable ──────────────────────
  if (conclusion.foreign_quote) {
    return (
      <HeroCard tone="amber">
        <Title>Ce document est un devis étranger.</Title>
        <Body>
          Notre lecture s'appuie sur les tarifs et la réglementation français ;
          elle n'est donc pas transposable à un devis émis en {conclusion.foreign_quote.country_label}.
          Nous vous recommandons de demander une deuxième proposition à un professionnel local pour comparer.
        </Body>
      </HeroCard>
    );
  }

  if (conclusion.estimation_courtier) {
    const nom = conclusion.estimation_courtier.courtier_nom;
    return (
      <HeroCard tone="amber">
        <Title>Ce document n'est pas un devis d'artisan.</Title>
        <Body>
          Il s'agit d'une estimation {nom ? `émise par ${nom}` : "de courtier travaux"}, pas d'un devis signé par un professionnel.
          Le vrai devis sera établi plus tard par l'artisan retenu.
          Une fois ce devis reçu, revenez ici pour une lecture complète.
        </Body>
      </HeroCard>
    );
  }

  if (conclusion.incomplete_quote) {
    return (
      <HeroCard tone="amber">
        <Title>Ce devis est trop synthétique pour être relu poste par poste.</Title>
        <Body>
          Il indique les sous-totaux par corps de métier mais pas les quantités ni les prix unitaires.
          Demandez à votre artisan un devis détaillé, avec les surfaces (m², ml) et le prix par unité pour chaque prestation. Vous pourrez alors nous le soumettre à nouveau.
        </Body>
      </HeroCard>
    );
  }

  if (conclusion.hors_scope) {
    return (
      <HeroCard tone="amber">
        <Title>Ce document n'est pas un devis de travaux du bâtiment.</Title>
        <Body>
          Nous sommes spécialisés dans la relecture de devis de chantier (maçonnerie, électricité, plomberie, rénovation…). Pour ce type de document, mieux vaut nous en soumettre un autre.
        </Body>
      </HeroCard>
    );
  }

  if (conclusion.prestation_intellectuelle) {
    const metier = conclusion.prestation_intellectuelle.metier;
    return (
      <HeroCard tone="calm">
        <Title>Il s'agit d'une prestation intellectuelle réglementée.</Title>
        <Body>
          Les honoraires d'un(e) {metier} suivent des règles propres à sa profession (barème, ordre, statut).
          Les conditions de paiement inhabituelles pour un chantier classique (acompte élevé, par exemple) sont ici la norme du métier.
        </Body>
      </HeroCard>
    );
  }

  // ── Hard block prioritaire (entreprise radiée, IBAN suspect, etc.) ─────
  if (criticalReasons.length > 0) {
    return (
      <HeroCard tone="alert">
        <Title>Nous vous invitons à ne pas signer sans clarification.</Title>
        <Body>
          <ul className="mt-1 space-y-1.5 list-none pl-0">
            {criticalReasons.slice(0, 3).map((r, i) => (
              <li key={i} className="flex gap-2 text-[15px] leading-relaxed">
                <span aria-hidden="true" className="text-rose-900/60">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Body>
      </HeroCard>
    );
  }

  // ── Cas standards ──────────────────────────────────────────────────────
  const tone = toneFor(conclusion);
  const isSigner = conclusion.verdict_decisionnel === "signer";
  const isNegocier = conclusion.verdict_decisionnel === "signer_avec_negociation";
  const isRefuser = conclusion.verdict_decisionnel === "ne_pas_signer";

  const title = isSigner
    ? "Ce devis nous paraît cohérent."
    : isNegocier
    ? "Ce devis nous paraît négociable."
    : "Ce devis présente plusieurs points qui méritent d'être clarifiés avant signature.";

  // Chiffre nuancé (jamais isolé en grande typo, jamais accusatoire)
  const surcout = conclusion.surcout_global;
  const hasMargin = !isSigner && surcout && surcout.max > 0;
  const midRaw = hasMargin ? (surcout.min + surcout.max) / 2 : 0;
  const midSoft = hasMargin ? softRound(midRaw) : 0;

  // Phrase explicative (une, courte)
  const bodyText = (() => {
    const base = (conclusion.phrase_intro || "").trim();
    if (isSigner) {
      // Nous ne parlons pas d'écart quand tout est cohérent — silence assumé.
      return base || "Le prix, l'entreprise et les conditions de paiement sont dans les habitudes du métier.";
    }
    if (isNegocier && hasMargin) {
      const chiffre = `aux alentours de ${fmtEUR(midSoft)}, peut-être un peu plus, peuvent être ouverts à la discussion.`;
      return `Le prix global reste raisonnable, mais quelques prestations semblent au-dessus des habitudes du marché. ${chiffre}`;
    }
    if (isNegocier) {
      return base || "Quelques prestations méritent d'être discutées avec l'artisan avant de signer.";
    }
    if (isRefuser) {
      return base || "Plusieurs points nous interpellent et méritent une clarification avant tout engagement.";
    }
    return base;
  })();

  // Ligne d'honnêteté sur la couverture (silencieuse à 100 %)
  const coverageLine = (() => {
    if (typeof comparableCount === "number" && typeof totalCount === "number" && totalCount > 0) {
      if (comparableCount >= totalCount) {
        return "Nous avons pu comparer la quasi-totalité des prestations de votre devis.";
      }
      return `Notre avis s'appuie sur ${comparableCount} prestations comparables sur ${totalCount}.`;
    }
    if (conclusion.comparison_indicative) {
      return "Certaines prestations n'ont pas d'équivalent direct dans notre référentiel — notre avis reste indicatif sur ces points.";
    }
    return null;
  })();

  return (
    <HeroCard tone={tone}>
      <Title>{title}</Title>
      <Body>{bodyText}</Body>
      {coverageLine && (
        <p className="mt-4 text-[13px] italic text-foreground/60 leading-relaxed">
          {coverageLine}
        </p>
      )}
    </HeroCard>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS DE PRÉSENTATION
// ═══════════════════════════════════════════════════════════════════

function HeroCard({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const style = TONE_STYLES[tone];
  return (
    <section
      aria-label="Notre lecture du devis"
      className={`rounded-2xl border ${style.container} px-6 py-7 md:px-8 md:py-9`}
    >
      {children}
    </section>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl md:text-[28px] font-semibold tracking-tight text-foreground leading-tight">
      {children}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 text-[16px] md:text-[17px] leading-relaxed text-foreground/80">
      {children}
    </div>
  );
}
