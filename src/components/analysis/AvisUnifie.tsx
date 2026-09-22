/**
 * src/components/analysis/AvisUnifie.tsx
 *
 * 🟡 MAQUETTE EN COURS DE VALIDATION (2026-09-22, demande Johan) — PAS ENCORE
 * BRANCHÉE EN PRODUCTION. `AvisEtPreparation` reste le composant servi.
 *
 * ── Ce qu'elle change, et pourquoi ────────────────────────────────────────
 *
 * 1. UN SEUL BLOC AU LIEU DE TROIS. La page enchaînait « Notre lecture »,
 *    « Avant de signer » et « Préparez votre rendez-vous » : trois cartes qui
 *    répondent à la même question et obligent le lecteur à arbitrer entre
 *    trois listes. C'est le défaut de structure du 15/09 sur le matériel
 *    (« il ne faut pas créer 2 espaces alors qu'on répond à la même
 *    question »), reconstruit à l'échelle de la page.
 *
 * 2. LES POINTS D'ATTENTION REMONTENT. Sur le devis JeanBERNARD, le hero
 *    affichait deux points verts et la note Google de 3,6/5 vivait trois
 *    écrans plus bas. On remontait ce qui rassure, on enterrait ce qui
 *    inquiète — l'asymétrie corrigée le 10/09 sur les prix.
 *
 * 3. `PourquoiCetAvis` DISPARAÎT. Ce bloc rendait `verdict_reasons.reasons[]`
 *    et `justifications`, deux champs que le correctif du 16/09 n'avait PAS
 *    couverts (il visait `phrase_intro` et `.summary`). Mesuré sur 90 jours :
 *    sur 79 analyses dont la portée ne permet pas d'affirmer un prix,
 *    **7 l'affirmaient quand même ici** — le plus souvent avec la phrase
 *    « ✅ Prix conforme au marché », sous un titre disant l'inverse.
 *    Le supprimer ne range pas la page : ça ferme une fuite de l'invariant.
 *
 * 4. CE QUI ALERTE RESTE VISIBLE, CE QUI PRÉPARE SE DÉPLIE. 90 % des
 *    visiteurs ne voient qu'un écran : mettre les points d'attention derrière
 *    un dépli les enterrerait autrement. Seule la préparation du rendez-vous
 *    (ce qu'on peut rappeler, demander, le message à envoyer) est repliée.
 *
 * ⚠️ AUCUN WORDING N'EST RECOPIÉ ICI. Titre, corps, points vérifiés, sections
 * de préparation et message copiable viennent tous des fonctions de
 * production (`AvisSurLeDevis`, `buildPreparationSections`,
 * `buildArtisanMessage`). C'est la leçon de `preview-review-email.ts` du
 * 11/09 : un aperçu qui a son propre texte ne valide rien.
 */

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Check } from "lucide-react";
import type { ConclusionData } from "@/lib/analyse/conclusionTypes";
import type { Portee } from "@/lib/analyse/porteeAnalyse";
import AvisSurLeDevis from "./AvisSurLeDevis";
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
  criticalReasons?: string[];
  portee?: Portee | null;
  totalHt?: number | null;
  provisoire?: boolean;
  /**
   * Remonte la copie du message à `AnalysisResult` — c'est lui qui déclenche
   * la modale de retour (`openFeedback("manual_copy")`). Le perdre en
   * fusionnant les blocs couperait un des deux seuls déclencheurs.
   */
  onCopy?: () => void;
  /** Rendu statique (aperçu serveur) : le dépli utilise <details> natif. */
  statique?: boolean;
}

export default function AvisUnifie({
  conclusion,
  pointsOk,
  alertes,
  entrepriseName = null,
  criticalReasons = [],
  portee = null,
  totalHt = null,
  provisoire = false,
  onCopy,
  statique = false,
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  const [copieImpossible, setCopieImpossible] = useState(false);
  const zoneMessage = useRef<HTMLPreElement>(null);

  /**
   * 🔴 2026-09-22 — LE BOUTON « COPIER » ÉCHOUAIT EN SILENCE, ET LE DÉFAUT
   * VENAIT DE LA FICHE D'ORIGINE.
   *
   * `navigator.clipboard.writeText(...).then(...)` sans `.catch()` : quand
   * l'écriture est refusée (permission, contexte non sécurisé, iframe sans
   * `clipboard-write`, Firefox restrictif), la promesse rejette, le `.then()`
   * n'est jamais atteint — **le clic ne produit rien**. Ni copie, ni libellé
   * « Copié », ni `onCopy`, donc pas de modale de retour. L'utilisateur
   * recommence, puis abandonne.
   *
   * Constaté en cliquant dans le navigateur, pas en relisant le code :
   * `Uncaught (in promise) NotAllowedError: Write permission denied`.
   *
   * ⚠️ `document.execCommand("copy")` est déprécié mais reste le SEUL repli
   * qui fonctionne partout. Et si les deux échouent, on sélectionne le texte
   * pour que l'utilisateur n'ait plus qu'à faire Ctrl+C — se taire serait
   * revenir au défaut qu'on corrige.
   */
  const copierLeMessage = async () => {
    if (!message) return;
    let reussi = false;
    try {
      await navigator.clipboard.writeText(message);
      reussi = true;
    } catch {
      try {
        const zone = zoneMessage.current;
        if (zone) {
          const selection = window.getSelection();
          const plage = document.createRange();
          plage.selectNodeContents(zone);
          selection?.removeAllRanges();
          selection?.addRange(plage);
          reussi = document.execCommand("copy");
        }
      } catch {
        reussi = false;
      }
    }
    if (reussi) {
      setCopieImpossible(false);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
      onCopy?.();
      return;
    }
    // Le texte reste sélectionné par le repli ci-dessus : on le dit.
    setCopieImpossible(true);
  };

  const sections = useMemo(
    () => buildPreparationSections(conclusion, pointsOk, alertes),
    [conclusion, pointsOk, alertes],
  );

  const prenom = useMemo(() => extractArtisanFirstName(entrepriseName), [entrepriseName]);
  const message = useMemo(
    () =>
      buildArtisanMessage(prenom, conclusion.leviers ?? [], {
        includeUrssaf: sections.aNePasOublier.some((o) => /vigilance\s+urssaf/i.test(o)),
      }),
    [prenom, conclusion.leviers, sections.aNePasOublier],
  );

  /**
   * Ce qui appelle une vérification = les standards du métier à réclamer
   * + les conseils de prudence liés à l'entreprise (`conseilsPrudence`, 20/08).
   *
   * 🔴 ON LIT `aNePasOublierAffichage`, PAS `aNePasOublier`. Le second est
   * écrit pour le MAIL À L'ARTISAN : il coupe à la parenthèse et au premier
   * auto-conseil, donc « Note Google moyenne : 3.6/5 (140 avis). […] Lisez les
   * avis récents pour identifier les motifs de mécontentement » devenait
   * « Note Google moyenne : 3.6/5 ». Le nombre d'avis et le conseil de lecture
   * que Johan réclamait EXISTAIENT : la fiche les jetait en route.
   *
   * ⚠️ Ma première version de cette maquette RÉÉCRIVAIT le conseil de lecture
   * dans le composant — moins bien que celui déjà stocké. C'est exactement ce
   * que ce projet interdit : un affichage qui a son propre wording.
   */
  const pointsAttention = useMemo(
    () => [...sections.aNePasOublierAffichage, ...sections.conseilsPrudence].slice(0, 4),
    [sections],
  );

  const leviers = conclusion.leviers ?? [];
  const aPreparation =
    Boolean(sections.rappelPourOuvrir) || sections.aDemander.length > 0 || Boolean(message);

  const corpsPreparation = (
    <div className="mt-4 space-y-5">
      {sections.rappelPourOuvrir && (
        <div>
          <SousTitre>Ce que vous pouvez rappeler pour ouvrir la discussion</SousTitre>
          <p className="mt-1.5 text-[15px] leading-relaxed text-foreground/80">
            {sections.rappelPourOuvrir}
          </p>
        </div>
      )}
      {sections.aDemander.length > 0 && (
        <div>
          <SousTitre>Ce que vous pouvez lui demander</SousTitre>
          <ul className="mt-1.5 space-y-2">
            {sections.aDemander.map((d, i) => (
              <li key={i} className="flex gap-2 text-[15px] leading-relaxed text-foreground/80">
                <span aria-hidden="true" className="text-foreground/30">•</span>
                <span>{d.context}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message && (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <SousTitre>Un message prêt à envoyer</SousTitre>
            {!statique && (
              <button
                type="button"
                onClick={copierLeMessage}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground/70 hover:text-foreground"
              >
                {copie ? (
                  <><Check className="h-3.5 w-3.5" aria-hidden="true" />Copié</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copier</>
                )}
              </button>
            )}
          </div>
          <pre
            ref={zoneMessage}
            className="mt-1.5 whitespace-pre-wrap rounded-lg border border-foreground/10 bg-background/70 p-3.5 font-sans text-[14px] leading-relaxed text-foreground/80"
          >
            {message}
          </pre>
          {copieImpossible && (
            <p role="status" className="mt-1.5 text-[13px] leading-relaxed text-foreground/60">
              Votre navigateur bloque la copie automatique. Le message est
              sélectionné : faites Ctrl+C (ou Cmd+C) pour le copier.
            </p>
          )}
        </div>
      )}
      {/* Gardée de la fiche : elle cadre le TON de la démarche, et c'est ce qui
          distingue une préparation d'une mise en accusation. */}
      <p className="border-t border-foreground/10 pt-4 text-[13px] italic leading-relaxed text-foreground/55">
        Cette préparation est structurée pour rester bienveillante et ouvrir un dialogue.
        Elle ne remet en cause ni son travail ni son professionnalisme.
      </p>
    </div>
  );

  return (
    <AvisSurLeDevis
      conclusion={conclusion}
      portee={portee}
      pointsOk={pointsOk}
      pointsAttention={pointsAttention}
      entrepriseName={entrepriseName}
      totalHt={totalHt}
      criticalReasons={criticalReasons}
      provisoire={provisoire}
    >
      {(leviers.length > 0 || aPreparation) && (
        <div className="mt-6 border-t border-foreground/10 pt-5">
          {leviers.length > 0 && (
            <div className="space-y-2.5">
              {leviers.map((l, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-foreground/10 bg-background/60 px-4 py-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/40">
                      {l.objectif === "securiser" ? "Sécuriser" : "Négocier"}
                    </span>
                  </div>
                  <p className="mt-1 text-[15px] font-medium leading-snug text-foreground">
                    {l.titre}
                  </p>
                  {l.detail && (
                    <p className="mt-1 text-[14px] leading-relaxed text-foreground/65">{l.detail}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {aPreparation && (
            statique ? (
              <details className="mt-4 group">
                <summary className="cursor-pointer list-none text-[14px] font-medium text-foreground/70 hover:text-foreground">
                  Préparer le rendez-vous avec l'artisan ▾
                </summary>
                {corpsPreparation}
              </details>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setOuvert((v) => !v)}
                  aria-expanded={ouvert}
                  className="flex items-center gap-1.5 text-[14px] font-medium text-foreground/70 hover:text-foreground"
                >
                  Préparer le rendez-vous avec l'artisan
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform ${ouvert ? "rotate-180" : ""}`}
                  />
                </button>
                {ouvert && corpsPreparation}
              </div>
            )
          )}
        </div>
      )}
    </AvisSurLeDevis>
  );
}

function SousTitre({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
      {children}
    </p>
  );
}
