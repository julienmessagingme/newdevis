/**
 * src/components/analysis/MaterielVerifie.tsx
 *
 * 2026-09-15 — LE MATÉRIEL CHIFFRÉ PAR SA RÉFÉRENCE FABRICANT.
 *
 * Origine : un devis de climatisation déclaré « cohérent » alors que 15 625 €
 * sur 16 485 € n'avaient aucune référence. Ces climatiseurs ne sont pourtant
 * ni du sur-mesure ni du réglementaire — ce sont des produits de catalogue
 * dont le prix est public. Le devis était bien correct ; simplement, on
 * n'avait rien pour le dire.
 *
 * 🔴 CES CARTES VIVENT DANS L'ANALYSE DES POSTES, PAS DANS UN BLOC À PART.
 * Première version livrée : une section autonome au-dessus du détail. Retour
 * de Johan en voyant la page — « il ne faut pas créer 2 espaces alors qu'on
 * répond à la même question ». Il a raison : le prix d'un poste est une seule
 * question, deux endroits pour y répondre obligent le lecteur à arbitrer
 * lui-même entre deux réponses. Le composant n'expose donc plus de `<section>`
 * ni de titre : il rend des CARTES, que `BlockPrixMarche` place en tête de sa
 * liste — d'abord ce qu'on sait le mieux.
 *
 * 🔴 CE BLOC NE DÉNONCE PAS UNE MARGE, IL DONNE UNE RÉFÉRENCE.
 * La marge de l'installateur sur le matériel est de +30 à +50 % — mesuré sur
 * 19 références, chez des artisans différents, sur deux marques. C'est le
 * fonctionnement normal du métier : il achète avec une remise de négociant et
 * revend. On ne le commente donc pas en dessous de +50 %.
 *
 * ⚠️ AUCUN LIEN MARCHAND, ET C'EST DÉLIBÉRÉ. Pousser le lecteur à acheter le
 * matériel lui-même serait un mauvais conseil : beaucoup d'artisans refusent
 * de poser du matériel fourni par le client, ou déclinent leur garantie
 * dessus. On donne de quoi NÉGOCIER, pas de quoi court-circuiter.
 */

import type { ConclusionData } from "@/lib/analyse/conclusionTypes";

export type Materiel = NonNullable<ConclusionData["materiel_verifie"]>[number];

const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

const dateCourte = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : iso;
};

const TON: Record<Materiel["zone"], { cadre: string; badge: string; libelle: string }> = {
  normal:   { cadre: "border-border/60", badge: "bg-emerald-500/10 text-emerald-700", libelle: "Prix cohérent" },
  mention:  { cadre: "border-amber-200",  badge: "bg-amber-500/10 text-amber-700",    libelle: "Un peu au-dessus" },
  question: { cadre: "border-rose-200",   badge: "bg-rose-500/10 text-rose-700",      libelle: "À faire expliquer" },
};

/** Une carte d'équipement, au format des autres cartes de poste. */
export function CarteMateriel({ m }: { m: Materiel }) {
  const t = TON[m.zone];
  return (
    <div className={`border ${t.cadre} rounded-xl bg-card p-3 sm:p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        {/* ⚠️ Le titre est la LIGNE DU DEVIS, jamais notre désignation
            catalogue — règle du 2026-09-10 : le lecteur doit reconnaître
            sa ligne, pas notre hypothèse. */}
        <p className="text-[13px] sm:text-sm font-semibold text-foreground leading-snug min-w-0 flex-1">
          {m.ligne}
        </p>
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${t.badge}`}>
          {t.libelle}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] sm:text-xs">
        <span className="text-muted-foreground">
          {m.quantite > 1 ? `${m.quantite} u` : "1 u"}
        </span>
        <span>
          <span className="text-muted-foreground">Devis : </span>
          <span className="font-semibold text-foreground">{euros(m.prix_unitaire_devis)}</span>
          {m.quantite > 1 && <span className="text-muted-foreground"> l'unité</span>}
        </span>
        <span>
          <span className="text-muted-foreground">Distribution : </span>
          <span className="font-medium text-foreground">
            {euros(m.marche_min_ht)} – {euros(m.marche_max_ht)}
          </span>
          <span className="text-muted-foreground"> HT</span>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{m.reference}</span>
      </div>

      {m.zone !== "normal" && (
        <p className="mt-2 text-[12px] sm:text-xs text-foreground/75 leading-relaxed">
          {m.zone === "question"
            ? `Facturé environ ${m.ecart_min_pct} % au-dessus de son prix en distribution, quand l'usage se situe entre 30 et 50 %. Demandez le détail entre le matériel et la pose.`
            : `L'écart (environ ${m.ecart_min_pct} %) dépasse un peu l'usage du métier. De quoi en parler, sans que ce soit anormal.`}
        </p>
      )}
    </div>
  );
}

/**
 * La phrase qui introduit ces cartes dans la liste des postes.
 * Courte : elle ne redit pas ce que le verdict a déjà dit plus haut.
 */
export function IntroMateriel({ materiel }: { materiel: Materiel[] }) {
  const horsUsage = materiel.filter((m) => m.zone !== "normal").length;
  return (
    <p className="text-[12px] sm:text-xs text-muted-foreground leading-relaxed">
      <span className="font-medium text-foreground">
        {materiel.length === 1 ? "Un équipement est identifié" : `${materiel.length} équipements sont identifiés`}
      </span>{" "}
      par leur référence fabricant. Nous les comparons au prix auquel vous les achèteriez
      vous-même chez un distributeur — pas à ce que l'artisan les a payés, que personne ne
      connaît. {horsUsage === 0
        ? "L'écart couvre sa pose, son déplacement et sa garantie."
        : "L'écart couvre sa pose, son déplacement et sa garantie ; au-delà de la moitié du prix, il mérite une explication."}
    </p>
  );
}

/**
 * 🔴 LA SOURCE ET LA DATE SONT AFFICHÉES — c'est ce qui rend le chiffre
 * opposable, et c'est une demande explicite de Johan. On cite le NOMBRE de
 * distributeurs et la date plutôt que les noms : nommer un marchand nous
 * rendrait dépendants de son erreur de prix, et la date, elle, reste vraie
 * pour toujours.
 */
export function NoteSourcesMateriel({ materiel }: { materiel: Materiel[] }) {
  if (materiel.length === 0) return null;
  const releve = materiel[0]?.releve_le ?? "";
  // Toutes nos entrées ont au moins deux sources (contrainte SQL) ; on annonce
  // le minimum du lot, jamais un chiffre plus flatteur.
  const sourcesMin = Math.min(...materiel.map((m) => m.nb_sources));
  return (
    <p className="text-[11px] text-muted-foreground leading-relaxed italic">
      Prix du matériel relevés le {dateCourte(releve)} chez au moins {sourcesMin} distributeurs
      français, hors offres d'import à long délai et hors tarif catalogue constructeur — ce
      dernier vaut deux à trois fois le prix réellement pratiqué.
    </p>
  );
}
