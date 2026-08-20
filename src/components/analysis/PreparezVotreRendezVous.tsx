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
 * Sous la fiche, un accordéon très discret propose une version écrite (mail,
 * SMS, WhatsApp) pour ceux qui préfèrent envoyer un message.
 */

import { useMemo, useState } from "react";
import { ChevronDown, Copy, Check } from "lucide-react";
import type { ConclusionData } from "@/lib/analyse/conclusionTypes";
import {
  buildPreparationSections,
  extractArtisanFirstName,
  levierQuestion,
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
  const [copied, setCopied] = useState<string | null>(null);

  const sections = useMemo(
    () => buildPreparationSections(conclusion, pointsOk, alertes),
    [conclusion, pointsOk, alertes],
  );

  const prenom = useMemo(() => extractArtisanFirstName(entrepriseName), [entrepriseName]);
  const titleSuffix = prenom ? prenom : "votre artisan";

  // Tranche 2 — si les leviers portent des questions de négociation, le
  // message copiable existe même quand la fiche est vide (toutes les actions
  // dédupliquées par les leviers) : on garde le bloc pour l'accordéon.
  const hasLevierQuestions = (conclusion.leviers ?? []).some(
    (l) => l.objectif !== "securiser",
  );
  const nothingToShow =
    !sections.rappelPourOuvrir &&
    sections.aDemander.length === 0 &&
    sections.aNePasOublier.length === 0 &&
    sections.conseilsPrudence.length === 0 &&
    !hasLevierQuestions;

  const writtenMessages = useMemo(
    () => buildWrittenMessages(sections, prenom, conclusion.leviers ?? []),
    [sections, prenom, conclusion.leviers],
  );

  const handleCopyMessage = (channel: "mail" | "sms" | "whatsapp") => {
    const text = writtenMessages[channel];
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(channel);
      setTimeout(() => setCopied(null), 2500);
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
        <p className="mt-1 text-sm text-muted-foreground">
          Trois choses à avoir en tête pour aborder la discussion sereinement.
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

      {/* Accordéon discret : version écrite */}
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
          <div className="mt-4 space-y-4">
            <WrittenChannel
              label="Par mail"
              text={writtenMessages.mail}
              copied={copied === "mail"}
              onCopy={() => handleCopyMessage("mail")}
            />
            <WrittenChannel
              label="Par SMS"
              text={writtenMessages.sms}
              copied={copied === "sms"}
              onCopy={() => handleCopyMessage("sms")}
            />
            <WrittenChannel
              label="Sur WhatsApp"
              text={writtenMessages.whatsapp}
              copied={copied === "whatsapp"}
              onCopy={() => handleCopyMessage("whatsapp")}
            />
          </div>
        )}
      </div>
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

// ═══════════════════════════════════════════════════════════════════
// HELPERS DE TRANSCRIPTION VERS UN CANAL ÉCRIT
// Reformulation pure — aucune donnée nouvelle.
// ═══════════════════════════════════════════════════════════════════

/**
 * Retire les guillemets français « » des questions produites par
 * preparationBuilder pour la fiche visuelle. Dans le mail, les questions
 * s'insèrent directement dans le texte, pas besoin des guillemets.
 */
function stripFrenchQuotes(question: string): string {
  return question.replace(/^«\s*/, "").replace(/\s*»$/, "").trim();
}

/** Retire la ponctuation finale d'un item avant de l'insérer dans une phrase
 *  (« …pour 2026. » inséré avant « ? » donnait « …pour 2026. ? »). */
function trimTrailingDot(s: string): string {
  return s.replace(/[\s.;,]+$/g, "").trim();
}

/** Minuscule initiale SAUF sigle (IBAN, RGE, Kbis…) : on ne minuscule que si
 *  la 2e lettre est déjà minuscule ou une apostrophe (« L'attestation »). */
function lcFirstSafe(s: string): string {
  return /^[A-ZÀ-Ý][a-zà-ÿ'']/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function buildWrittenMessages(
  sections: ReturnType<typeof buildPreparationSections>,
  prenom: string | null,
  leviers: NonNullable<ConclusionData["leviers"]>,
): { mail: string; sms: string; whatsapp: string } {
  const salut = prenom ? `Bonjour ${prenom},` : "Bonjour,";
  const signature = "\n\nBien cordialement,";

  // 🟢 Phase 4 tranche 2 (2026-08-20) — le message est ALIGNÉ SUR LES LEVIERS
  // (spec Maillon 3, exigence 3) : les questions des leviers de négociation
  // arrivent en tête (dans l'ordre de puissance), puis les questions
  // complémentaires de la fiche (déjà dédupliquées par sujet côté
  // preparationBuilder). Cap à 5 questions — un mail n'est pas une liste.
  const levierQuestions = leviers
    .filter((l) => l.objectif !== "securiser")
    .map((l) => levierQuestion(l))
    .filter((q): q is string => Boolean(q));

  const questionsCleaned = [
    ...levierQuestions,
    ...sections.aDemander
      .map((item) => stripFrenchQuotes(item.question))
      .filter((s) => s.length > 0),
  ].slice(0, 5);

  const oubliCleaned = sections.aNePasOublier
    .map((o) => trimTrailingDot(o))
    .filter((s) => s.length > 0);

  const questionsBlock = questionsCleaned.length > 0
    ? questionsCleaned.map((q, i) => `${i + 1}. ${q}`).join("\n")
    : "";

  // Section « à ne pas oublier » — présentée comme une demande de pièces à
  // transmettre, sans impératif adressé au user (« assurez-vous », « pensez
  // à ») qui n'a aucun sens envoyé à l'artisan.
  let oublisBlock = "";
  if (oubliCleaned.length === 1) {
    oublisBlock = `\n\nEt pourriez-vous me transmettre ${lcFirstSafe(oubliCleaned[0])} ?`;
  } else if (oubliCleaned.length > 1) {
    oublisBlock = `\n\nEt pouvez-vous me transmettre :\n${oubliCleaned.map((o) => `- ${o}`).join("\n")}`;
  }

  const intro = questionsCleaned.length === 1
    ? "Merci pour votre devis. Avant de le signer, j'aurais une question :"
    : questionsCleaned.length > 1
    ? "Merci pour votre devis. Avant de le signer, j'aurais quelques questions :"
    : "Merci pour votre devis. Avant de m'engager, j'aurais un point rapide avec vous.";

  const mail = questionsBlock
    ? `${salut}\n\n${intro}\n\n${questionsBlock}${oublisBlock}${signature}`
    : `${salut}\n\n${intro}${oublisBlock}${signature}`;

  // SMS — condensé mais reste une suite de questions
  const smsQuestions = questionsCleaned.length > 0
    ? ` ${questionsCleaned.join(" ")}`
    : "";
  const smsOublis = oubliCleaned.length > 0
    ? ` Pourriez-vous me transmettre également : ${oubliCleaned.join(", ")} ?`
    : "";
  const sms = `${salut} Merci pour votre devis.${smsQuestions}${smsOublis} Merci d'avance !`;

  // WhatsApp — variante du mail, ton plus détendu
  const whatsapp = mail
    .replace(/\n\nBien cordialement,/, "\n\nMerci d'avance 🙏")
    .replace(/^Bonjour,/, "Bonjour 👋")
    .replace(/^Bonjour ([^,]+),/, "Bonjour $1 👋");

  return { mail, sms, whatsapp };
}
