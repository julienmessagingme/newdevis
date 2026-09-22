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
import {
  porteeSuffisantePourAffirmer,
  phrasePortee,
  type Portee,
} from "@/lib/analyse/porteeAnalyse";

type Tone = "calm" | "neutral" | "amber" | "alert";

interface ToneStyle {
  container: string;
  title: string;
}

const TONE_STYLES: Record<Tone, ToneStyle> = {
  calm: {
    container: "bg-emerald-50/70 border-emerald-200/70",
    title: "text-emerald-950",
  },
  // 🔴 2026-09-22 — LE QUATRIÈME ÉTAT, ET IL MANQUAIT DEPUIS TOUJOURS.
  // « Nous ne savons pas » sortait en AMBRE, comme « nous avons trouvé un
  // écart » : mesuré sur le stock, 28 analyses sur 149 (18,8 %) portaient un
  // titre d'alerte, et 23 d'entre elles ne pouvaient rien nommer. L'utilisateur
  // repartait avec un doute sans objet — « VMD me dit clarification, puis c'est
  // ok, puis on n'a pas pu vérifier » (Johan).
  // Gris ardoise délibérément : ni satisfecit (le vert dirait « c'est bon »
  // alors que nous n'en savons rien — la fuite d'invariant du 16/09 par
  // l'autre bout), ni alarme.
  neutral: {
    container: "bg-slate-50 border-slate-200",
    title: "text-slate-900",
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

/**
 * Types de leviers qui ne signalent AUCUN fait sur le devis.
 *
 * `references` est le fallback universel (« jamais de fiche vide ») et
 * `second_avis` dit précisément que nous n'avons pas su comparer. Les compter
 * comme des trouvailles ferait colorer en ambre un devis sur lequel nous
 * n'avons rien constaté — le défaut qu'on corrige.
 */
const LEVIERS_SANS_CONSTAT = new Set(["references", "second_avis"]);

/**
 * Avons-nous CONSTATÉ quelque chose sur ce devis ?
 *
 * ⚠️ Distinct de « savons-nous quelque chose » (c'est la portée). C'est la
 * séparation des deux axes qui referme le défaut : **la couleur ne porte que
 * ce qu'on a trouvé ; ce qu'on n'a pas pu vérifier s'écrit, il ne se colore
 * pas.**
 */
function aConstateQuelqueChose(conclusion: ConclusionData): boolean {
  if ((conclusion.anomalies?.length ?? 0) > 0) return true;
  if (conclusion.verdict_ligne?.marge) return true;
  return (conclusion.leviers ?? []).some(
    (l) => !LEVIERS_SANS_CONSTAT.has(String((l as { type?: string }).type ?? "")),
  );
}

function toneFor(conclusion: ConclusionData, portee: Portee | null): Tone {
  if (conclusion.verdict_decisionnel === "ne_pas_signer") return "alert";
  if (aConstateQuelqueChose(conclusion)) return "amber";
  // Rien constaté : reste à savoir si nous avions de quoi constater.
  if (!porteeSuffisantePourAffirmer(portee)) return "neutral";
  return "calm";
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
  /**
   * 🔴 2026-09-22 — SUR QUOI NOUS SOMMES-NOUS PRONONCÉS.
   *
   * Calculée par `porteeAnalyse`, la MÊME règle que le détail poste par poste :
   * le « 6 des 9 » annoncé ici doit se retrouver ligne à ligne plus bas, sinon
   * on reconstruit la divergence qu'on corrige. Elle décide aussi du ton
   * `neutral` quand nous n'avons rien pu comparer.
   *
   * ⚠️ `comparableCount` / `totalCount` ci-dessus n'ont JAMAIS été renseignées
   * par `AnalysisResult` : l'ancienne ligne de couverture ne s'affichait donc
   * que par la branche `comparison_indicative`. Elles restent pour le stock
   * d'appelants éventuels, la portée les remplace.
   */
  portee?: Portee | null;
  /** Motifs critiques (criteres_rouges) issus du scoring, pour le hard block. */
  criticalReasons?: string[];
  /**
   * 2026-08-30 — analyse en attente de validation experte : on n'affiche AUCUN
   * montant d'écart. Le bandeau bleu annonçait « verdict provisoire » pendant
   * que cette carte affirmait « 7 405–13 751 € » ; un client pouvait aller
   * négocier sur un chiffre que nous savions déjà faux.
   */
  provisoire?: boolean;
}

export default function AvisSurLeDevis({
  conclusion,
  provisoire = false,
  comparableCount,
  totalCount,
  portee = null,
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
  const tone = toneFor(conclusion, portee);
  const isSigner = tone === "calm";
  const isNegocier = tone === "amber";
  const isRefuser = conclusion.verdict_decisionnel === "ne_pas_signer";
  const nonVerifiable = tone === "neutral";

  // 2026-09-06 (retour Johan, cas Les Artisans de l'Habitat) — « Ce devis nous
  // paraît négociable » s'affichait sur un devis SANS écart chiffré, SANS
  // anomalie et SANS le moindre levier de négociation. Le titre promettait une
  // marge que rien ne soutenait.
  const aDeQuoiNegocier =
    (conclusion.leviers ?? []).some((l) => l.objectif === "negocier") ||
    Boolean(conclusion.verdict_ligne?.marge) ||
    (conclusion.anomalies?.length ?? 0) > 0;

  /** Les constats nommables — ce sont eux qui autorisent un titre chiffré. */
  const constats = (conclusion.leviers ?? []).filter(
    (l) => !LEVIERS_SANS_CONSTAT.has(String((l as { type?: string }).type ?? "")),
  ).length;

  // ⚠️ CE BLOC EST REMONTÉ ICI DÉLIBÉRÉMENT (2026-09-22). Il vivait plus bas,
  // après le titre ; depuis que le titre porte le montant, l'y laisser aurait
  // produit un `ReferenceError` de zone morte temporelle — illisible en
  // production, où Vite renomme la variable en une lettre. C'est le piège que
  // ce projet a déjà payé trois fois (cf. CLAUDE.md § TDZ).
  const surcout = conclusion.surcout_global;
  // 2026-09-05 (retour Johan, cas EC'eau) — ce chemin ne sert plus que les
  // conclusions SANS `verdict_ligne` (antérieures à la Phase 4). Il annonçait
  // « environ X € peuvent être renégociés » sur le seul critère
  // `surcout_global.max > 0`, sans qu'aucune anomalie ne soit listée en
  // dessous : le lecteur repartait avec un montant et aucune ligne où aller le
  // chercher. On exige désormais au moins une anomalie nommée — c'est elle qui
  // rend le montant vérifiable dans le détail poste par poste.
  const aUnPosteNomme = Array.isArray(conclusion.anomalies) && conclusion.anomalies.length > 0;
  const hasMargin = !isSigner && surcout && surcout.max > 0 && aUnPosteNomme;
  const midRaw = hasMargin ? (surcout.min + surcout.max) / 2 : 0;
  const midSoft = hasMargin ? softRound(midRaw) : 0;

  // 🔴 2026-09-22 — LE TITRE « demande quelques clarifications » DISPARAÎT.
  // Il annonçait une action sans jamais pouvoir la nommer, et se faisait
  // démentir trois lignes plus bas par « rien de significatif à négocier ».
  // Désormais : ou bien nous pouvons nommer (et le titre le dit), ou bien nous
  // n'avons pas pu vérifier (et le titre le dit aussi). Jamais d'entre-deux.
  // 🔴 2026-09-22 — LE TITRE PORTE LE MONTANT, PAS L'ADJECTIF.
  // « Le temps d'attention est de quelques secondes, le message principal doit
  // être visible en premier » (Johan). « Ce devis nous paraît négociable »
  // oblige à lire la phrase suivante pour savoir de combien on parle ; le
  // montant, lui, se retient. Le reste de la carte devient la justification.
  //
  // ⚠️ Jamais de chiffre en `provisoire` : tant que l'expert n'a pas tranché,
  // la page ne chiffre pas (règle du 30/08). Et jamais de chiffre sans poste
  // nommé pour le porter (règle du 05/09) — `hasMargin` l'exige déjà.
  //
  // ⚠️ SANS `softRound`, ET C'EST LE POINT. La première version affichait
  // « Environ 1 100 € » en titre quand le détail sommait 726 + 336 = 1 062 € :
  // deux chiffres pour un seul fait, le défaut même qu'on corrige. Depuis le
  // retrait du coefficient ×1,3 (15/09) le montant EST la somme des postes
  // nommés — l'arrondir le décroche du détail, et le lecteur qui additionne ne
  // retombe plus sur le chiffre annoncé.
  const titreChiffre = !provisoire && hasMargin && surcout!.max >= 300;
  const montantTitre =
    surcout && surcout.min === surcout.max
      ? fmtEUR(surcout.max)
      : `${fmtEUR(surcout?.min ?? 0)} à ${fmtEUR(surcout?.max ?? 0)}`;

  const title = isRefuser
    ? "Ce devis présente plusieurs points qui méritent d'être clarifiés avant signature."
    : nonVerifiable
    ? "Nous n'avons pas pu vérifier les prix de ce devis."
    : isNegocier
    ? titreChiffre
      ? `Environ ${montantTitre} semblent au-dessus du marché.`
      : aDeQuoiNegocier
      ? "Ce devis nous paraît négociable."
      : constats === 1
      ? "Un point à sécuriser avant de signer."
      : `${constats} points à sécuriser avant de signer.`
    : "Ce devis nous paraît cohérent.";

  // Phrase explicative (une, courte)
  const bodyText = (() => {
    // 2026-08-30 — en attente de validation experte, on ne CHIFFRE pas. La
    // structure du verdict (montant du devis + motif) est conservée, mais la
    // partie chiffrée de l'écart est remplacée par une phrase d'attente : le
    // client doit pouvoir lire son analyse sans partir négocier sur un montant
    // que l'expert n'a pas encore confirmé.
    const vl = conclusion.verdict_ligne;
    if (provisoire) {
      const montant = typeof vl?.resume === "string" && vl.resume.includes(" — ")
        ? vl.resume.split(" — ")[0]
        : null;
      const attente = "l'écart de prix est en cours de vérification par notre expert : nous préférons ne pas avancer de montant tant qu'il n'est pas confirmé.";
      return montant ? `${montant} — ${attente}` : attente.charAt(0).toUpperCase() + attente.slice(1);
    }
    // 🔴 2026-09-22 — EN ÉTAT NON VÉRIFIABLE, ON NE REPREND PAS `vl.resume`.
    // `leviersBuilder` y écrit « quelques prestations méritent une
    // clarification avec l'artisan avant signature » (branche « décision
    // non-signer sans signal dominant identifié ») : c'est ce texte qui, sous
    // l'ancien titre, laissait croire qu'il y avait quelque chose à demander.
    // Or il n'y a rien à demander — il y a quelque chose que NOUS ne savons
    // pas. On compose donc ici, avec la portée, qui est l'information juste.
    if (nonVerifiable) {
      const rien = (portee?.compares ?? 0) === 0;
      return rien
        ? "Aucune prestation de ce devis n'a d'équivalent assez proche dans nos références pour que nous puissions opposer un prix. Ce n'est pas un signe que le prix est mauvais : c'est que nous ne pouvons pas l'affirmer."
        : "Nous avons des tarifs approchants sur plusieurs postes, mais aucun assez proche pour vous donner un chiffre à défendre face à l'artisan. Ce n'est pas un signe que le prix est mauvais : c'est que nous ne pouvons pas l'affirmer.";
    }
    if (vl?.resume) {
      // ⚠️ Si le TITRE porte déjà le montant, on ne le répète pas ici : « Environ
      // 1 062 € semblent au-dessus du marché » suivi de « Marge de négociation
      // estimée : environ 1 062 € » fait lire deux fois le même chiffre et
      // donne l'impression de deux faits distincts.
      return vl.marge && !titreChiffre ? `${vl.resume} Marge de négociation estimée : ${vl.marge}.` : vl.resume;
    }
    const base = (conclusion.phrase_intro || "").trim();
    if (isSigner) {
      // Nous ne parlons pas d'écart quand tout est cohérent — silence assumé.
      return base || "Le prix, l'entreprise et les conditions de paiement sont dans les habitudes du métier.";
    }
    if (isNegocier && hasMargin) {
      // Ton adapté au montant absolu : dire « prix global raisonnable » sur
      // une négo de 6 800 € n'est pas cohérent, on tempère selon l'ordre
      // de grandeur du chiffre.
      //   < 1 000 €   → ton soft (petite négo)
      //   1 000-3 000 → ton neutre
      //   > 3 000 €   → ton ferme (négo significative)
      if (midSoft >= 3000) {
        return `Plusieurs prestations semblent nettement au-dessus des habitudes du marché. Nous estimons qu'environ ${fmtEUR(midSoft)} peuvent être renégociés.`;
      }
      if (midSoft >= 1000) {
        return `Quelques prestations semblent au-dessus des habitudes du marché. Environ ${fmtEUR(midSoft)} peuvent être renégociés.`;
      }
      return `Le prix global reste raisonnable, mais quelques prestations semblent au-dessus des habitudes du marché. Aux alentours de ${fmtEUR(midSoft)} peuvent être ouverts à la discussion.`;
    }
    if (isNegocier) {
      return base || "Quelques prestations méritent d'être discutées avec l'artisan avant de signer.";
    }
    if (isRefuser) {
      return base || "Plusieurs points nous interpellent et méritent une clarification avant tout engagement.";
    }
    return base;
  })();

  // 🔴 2026-09-22 — LA PORTÉE REMPLACE L'ANCIENNE « LIGNE DE COUVERTURE ».
  //
  // Celle-ci faisait deux à trois phrases et se lisait comme une excuse
  // (« Nous avons comparé au marché tout ce que notre référentiel couvre. Sur
  // le reste, nous n'avons pas de prix à opposer — un second devis reste le
  // meilleur comparatif… »). Pire : sa branche principale dépendait de
  // `comparableCount`/`totalCount`, que `AnalysisResult` n'a JAMAIS passées —
  // elle ne s'affichait donc que par `comparison_indicative`, au hasard des
  // analyses, et sans jamais donner de compte.
  //
  // Elle devient un FAIT VÉRIFIABLE, en une ligne, avec le renvoi vers l'endroit
  // où le lecteur peut le contrôler : « 6 des 9 prestations » en tête doit se
  // retrouver ligne à ligne dans le détail — c'est `porteeAnalyse` qui le
  // garantit, en appliquant la même règle que `BlockPrixMarche`.
  //
  // ⚠️ La liste des postes sans référence n'est plus reprise ici. Elle
  // apparaissait AVANT que le lecteur ait reçu sa réponse, et se lisait comme
  // un aparté (« on nous parle de nos références, alors qu'on attend encore de
  // savoir quoi faire »). Ces postes sont nommés là où ils comptent : dans le
  // détail, chacun sur sa carte.
  const ligneDePortee = phrasePortee(portee);

  // 🟢 2026-08-29 (retour Johan, devis 25030) — quand un expert corrige une
  // analyse, il RETIRE ce qui était faux ; sans ce bloc, la page ne gagnait
  // rien en échange et affichait « négociable » sans le moindre argument. Le
  // message de l'expert porte désormais la substance : ce qu'il a vu, et
  // pourquoi son verdict tient. Texte écrit par un humain (jamais du LLM
  // brut), distinct des notes internes de l'écran de revue.
  const expertMessage =
    typeof (conclusion as { expert_message?: unknown }).expert_message === "string"
      ? ((conclusion as { expert_message?: string }).expert_message ?? "").trim()
      : "";

  return (
    <HeroCard tone={tone}>
      <Title>{title}</Title>
      <Body>{bodyText}</Body>
      {expertMessage && (
        <div className="mt-5 rounded-lg border border-foreground/15 bg-background/60 p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-foreground/60">
            Vérifié par un expert VerifierMonDevis
          </p>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground/80">
            {expertMessage}
          </p>
        </div>
      )}
      {ligneDePortee && (
        <p className="mt-5 border-t border-foreground/10 pt-4 text-[13px] leading-relaxed text-foreground/60">
          {ligneDePortee}{" "}
          <a
            href="#detail-postes"
            className="whitespace-nowrap font-medium text-foreground/75 underline decoration-foreground/25 underline-offset-2 hover:text-foreground hover:decoration-foreground/50"
          >
            Voir le détail poste par poste ↓
          </a>
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
