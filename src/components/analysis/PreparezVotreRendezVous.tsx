/**
 * src/components/analysis/PreparezVotreRendezVous.tsx
 *
 * Le cœur du produit — Bible Produit VMD, bloc 2.
 * Prépare l'utilisateur à son rendez-vous (téléphone, physique, écrit) avec
 * l'artisan. Trois sections narratives, aucune injonction.
 *
 * Reformule les données déjà produites par le moteur (actions_avant_signature,
 * points_ok, alertes). Aucune nouvelle logique métier.
 *
 * Sous la fiche, un accordéon très discret propose UN message prêt à envoyer.
 * 2026-08-21 (décision Johan) — message UNIQUE et 100 % déterministe
 * (buildArtisanMessage : questions de leviers écrites à la main uniquement,
 * aucune phrase dérivée du LLM ne part chez l'artisan). Les 3 variantes
 * mail/SMS/WhatsApp sont supprimées.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Copy, Check } from "lucide-react";
import type { ConclusionData } from "@/lib/analyse/conclusionTypes";
import {
  buildPreparationSections,
  buildArtisanMessage,
  extractArtisanFirstName,
} from "@/lib/analyse/preparationBuilder";

interface Props {
  conclusion: ConclusionData;
  pointsOk: string[];
  alertes: string[];
  entrepriseName?: string | null;
  onCopy?: () => void;
}

export default function PreparezVotreRendezVous({
  conclusion,
  pointsOk,
  alertes,
  entrepriseName,
  onCopy,
}: Props) {
  const [writtenOpen, setWrittenOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const sections = useMemo(
    () => buildPreparationSections(conclusion, pointsOk, alertes),
    [conclusion, pointsOk, alertes],
  );

  const prenom = useMemo(() => extractArtisanFirstName(entrepriseName), [entrepriseName]);
  const titleSuffix = prenom ? prenom : "votre artisan";

  // 2026-08-21 — message UNIQUE 100 % déterministe (questions de leviers
  // écrites à la main + gabarit URSSAF). null si aucun levier de négociation
  // → l'accordéon est masqué (rien qui vaille un envoi).
  const artisanMessage = useMemo(
    () =>
      buildArtisanMessage(prenom, conclusion.leviers ?? [], {
        includeUrssaf: sections.aNePasOublier.some((o) => /vigilance\s+urssaf/i.test(o)),
      }),
    [prenom, conclusion.leviers, sections.aNePasOublier],
  );

  const nothingToShow =
    !sections.rappelPourOuvrir &&
    sections.aDemander.length === 0 &&
    sections.aNePasOublier.length === 0 &&
    sections.conseilsPrudence.length === 0 &&
    !artisanMessage;

  const handleCopyMessage = () => {
    if (!artisanMessage) return;
    navigator.clipboard.writeText(artisanMessage).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      onCopy?.();
    });
  };

  // Cas rare : rien à préparer (devis parfait ET pas d'alerte). On n'affiche
  // même pas la section 3 vide — silence assumé (Bible §11 principe #4).
  if (nothingToShow) {
    return null;
  }

  return (
    <section
      aria-labelledby="preparez-title"
      className="mt-6 rounded-2xl border border-border bg-card px-6 py-7 md:px-8 md:py-9"
    >
      <header className="mb-6">
        <h2
          id="preparez-title"
          className="text-xl md:text-2xl font-semibold tracking-tight text-foreground"
        >
          Préparez votre rendez-vous avec {titleSuffix}
        </h2>
        {/* 2026-08-27 (retour Johan) — « Trois choses » en dur mentait dès que
            moins de 3 sections s'affichaient. Wording neutre. */}
        <p className="mt-1 text-sm text-muted-foreground">
          L'essentiel à avoir en tête pour aborder la discussion sereinement.
        </p>
      </header>

      <div className="space-y-8">
        {sections.rappelPourOuvrir && (
          <Section title="Ce que vous pouvez rappeler pour ouvrir la discussion">
            <p className="text-[15.5px] leading-relaxed text-foreground/85">
              {sections.rappelPourOuvrir}
            </p>
          </Section>
        )}

        {/* 2026-08-20 (retour Johan) — lecture en tirets simples : une ligne
            déclarative par sujet, plus de doublon « titre + citation en
            italique ». Les questions formulées vivent dans le message
            copiable (« Vous préférez lui écrire ? »). */}
        {sections.aDemander.length > 0 && (
          <Section title="Ce que vous pouvez lui demander">
            <ul className="space-y-2.5 list-none pl-0">
              {sections.aDemander.map((item, i) => (
                <li key={i} className="flex gap-3 text-[15.5px] leading-relaxed text-foreground/85">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground/40" />
                  <span>{item.context}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(sections.aNePasOublier.length > 0 || sections.conseilsPrudence.length > 0) && (
          <Section title="Ce qu'il ne faut pas oublier">
            <ul className="space-y-2.5 list-none pl-0">
              {sections.conseilsPrudence.map((item, i) => (
                <li key={`p-${i}`} className="flex gap-3 text-[15.5px] leading-relaxed text-foreground/85">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500/70" />
                  <span>{item}</span>
                </li>
              ))}
              {sections.aNePasOublier.map((item, i) => (
                <li key={i} className="flex gap-3 text-[15.5px] leading-relaxed text-foreground/85">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground/40" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <p className="mt-8 pt-6 border-t border-border/60 text-[13px] italic text-foreground/55 leading-relaxed">
        Cette préparation est structurée pour rester bienveillante et ouvrir un dialogue.
        Elle ne remet en cause ni son travail ni son professionnalisme.
      </p>

      {/* Accordéon discret : LE message prêt à envoyer (unique, déterministe).
          Masqué s'il n'y a aucun levier de négociation. */}
      {artisanMessage && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setWrittenOpen((o) => !o)}
            aria-expanded={writtenOpen}
            className="inline-flex items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${writtenOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            Vous préférez lui écrire&nbsp;?
          </button>

          {writtenOpen && (
            <div className="mt-4">
              <WrittenChannel
                label="Message prêt à envoyer"
                text={artisanMessage}
                copied={copied}
                onCopy={handleCopyMessage}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/50 mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function WrittenChannel({
  label,
  text,
  copied,
  onCopy,
}: {
  label: string;
  text: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 text-xs text-foreground/70 hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Copié
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copier
            </>
          )}
        </button>
      </div>
      <pre className="px-4 py-3 text-[13.5px] text-foreground/80 leading-relaxed whitespace-pre-wrap font-sans">
        {text}
      </pre>
    </div>
  );
}

// 2026-08-21 — buildWrittenMessages (mail/SMS/WhatsApp assemblés depuis les
// actions reformulées) SUPPRIMÉ (décision Johan). Le message unique est
// désormais construit par buildArtisanMessage (preparationBuilder) — 100 %
// déterministe, aucune phrase dérivée du LLM ne part chez l'artisan.
