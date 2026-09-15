/**
 * src/components/analysis/PourquoiCetAvis.tsx
 *
 * Bible Produit VMD, bloc 4 : « Ce qui nous a menés à cet avis ».
 * 4 phrases courtes, langage humain, aucun jargon.
 *
 * Reformule verdict_reasons (déjà produit par le moteur) sans en changer
 * le sens. Aucune nouvelle logique.
 */

import type { ConclusionData } from "@/lib/analyse/conclusionTypes";

interface Props {
  conclusion: ConclusionData;
  /**
   * 🔴 2026-09-15 — EN ATTENTE DE VALIDATION EXPERTE, AUCUN MONTANT. La règle
   * du 2026-08-30 n'avait été appliquée qu'au hero et aux leviers : ce bloc
   * continuait d'annoncer « écart représentant 18 % du devis — estimé ~4,2 k€ »
   * six lignes sous une phrase disant « nous préférons ne pas avancer de
   * montant tant qu'il n'est pas confirmé ». Trouvé en regardant la page, pas
   * le code.
   */
  provisoire?: boolean;
}

/** Une phrase qui chiffre un écart : montant en euros, en k€, ou pourcentage. */
const CHIFFRE_UN_ECART = /(\d[\d\s  ]*[,.]?\d*\s*(k?€|euros?))|(\d+\s*%)/i;

const TECH_LEXICON = [
  /verdict\s+(décisionnel|décisionnelle)/gi,
  /anomalie[s]?/gi,
  /surcoût/gi,
  /surcout/gi,
  /matching/gi,
  /confidence/gi,
  /scoring/gi,
  /pondération/gi,
  /moteur/gi,
];

function humanize(sentence: string): string {
  let s = sentence.trim();
  // Retire préfixes techniques
  s = s.replace(/^\[(.+?)\]\s*/g, "");
  // Reformule quelques termes du jargon
  s = s.replace(/anomalie[s]? majeure[s]?/gi, "points nettement au-dessus des habitudes du marché");
  s = s.replace(/anomalie[s]?/gi, "points à revoir");
  s = s.replace(/surcoût/gi, "écart");
  s = s.replace(/surcout/gi, "écart");
  s = s.replace(/verdict\s+décisionnel/gi, "avis");
  s = s.replace(/matching/gi, "comparaison");
  // Filtre les mots qui n'ont rien à faire face à un particulier
  if (TECH_LEXICON.some((rx) => rx.test(s))) return "";
  // Ponctuation finale
  if (!/[.!?]$/.test(s)) s = s + ".";
  return s;
}

export default function PourquoiCetAvis({ conclusion, provisoire = false }: Props) {
  // On lit d'abord les raisons structurées (verdict_reasons.reasons),
  // sinon on retombe sur justifications découpé en phrases.
  const raw: string[] = (() => {
    const r = conclusion.verdict_reasons?.reasons;
    if (Array.isArray(r) && r.length > 0) return r;
    const j = conclusion.justifications;
    if (typeof j === "string" && j.trim()) {
      return j
        .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  })();

  const phrases = raw
    .map(humanize)
    .filter((s) => s.length > 0)
    // ⚠️ On retire la PHRASE, on ne masque pas le bloc : les raisons qui ne
    // chiffrent rien (« 3 postes présentent des prix anormalement élevés »)
    // restent vraies et utiles pendant l'attente.
    .filter((s) => !provisoire || !CHIFFRE_UN_ECART.test(s))
    .slice(0, 4);

  if (phrases.length === 0) return null;

  return (
    <section
      aria-labelledby="pourquoi-title"
      className="mt-6 px-6 md:px-8 py-6"
    >
      <h2
        id="pourquoi-title"
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/50 mb-4"
      >
        Ce qui nous a menés à cet avis
      </h2>
      <div className="space-y-3">
        {phrases.map((p, i) => (
          <p key={i} className="text-[15.5px] leading-relaxed text-foreground/80">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}
