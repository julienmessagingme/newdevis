/**
 * BlockClausesLitigieuses — V3.4.17 (2026-05-19)
 *
 * Affiche les clauses contractuelles potentiellement litigieuses ou illégales
 * extraites du texte libre du devis (CGV, mentions bas de page, conditions de
 * paiement). Détection assurée côté serveur via le prompt Gemini de
 * `extract.ts` — ce composant ne fait que rendre les résultats.
 *
 * Bloc affiché UNIQUEMENT s'il y a au moins une clause détectée (sinon
 * `null` → bloc absent du rendu pour ne pas créer de bruit visuel sur les
 * devis propres).
 *
 * Logique de gravité :
 *   - "rouge" → encadré rouge, signal d'alerte fort (clause probablement
 *     illégale en France pour les particuliers : devis payant si non signé,
 *     atteinte au droit de rétractation)
 *   - "orange" → encadré ambre, à clarifier avec l'artisan (pénalité
 *     excessive, sous-traitance libre, modification unilatérale du prix)
 */
import { AlertTriangle, FileWarning } from "lucide-react";

export interface ClauseLitigieuse {
  type:
    | "devis_facture_si_non_signe"
    | "pas_de_retractation"
    | "penalite_annulation_excessive"
    | "soustraitance_libre"
    | "modification_unilaterale";
  citation: string;
  gravite: "rouge" | "orange";
}

interface Props {
  clauses: ClauseLitigieuse[];
}

const CLAUSE_LABELS: Record<ClauseLitigieuse["type"], { titre: string; explication: string }> = {
  devis_facture_si_non_signe: {
    titre: "Devis facturé s'il n'est pas signé",
    explication:
      "Cette clause oblige le client à payer le devis s'il ne le signe pas. " +
      "C'est généralement ILLÉGAL en France pour les particuliers (Code de la consommation L113-3 + arrêté du 2 mars 1990 sur les devis travaux), sauf si l'artisan a informé par écrit le client AVANT l'établissement du devis et obtenu son accord explicite. " +
      "Si vous n'avez rien signé avant la réception du devis, vous n'avez probablement pas à payer ces frais. En cas de relance, demandez à l'artisan de fournir la preuve de votre accord préalable.",
  },
  pas_de_retractation: {
    titre: "Atteinte au droit de rétractation",
    explication:
      "Cette clause exclut ou limite votre droit de rétractation. " +
      "Pour les devis travaux signés à domicile ou à distance, vous bénéficiez d'un droit de rétractation de 14 jours (loi Hamon 2014, articles L221-18 et suivants du Code de la consommation). Cette clause ne peut pas vous priver de ce droit. " +
      "Demandez à l'artisan de retirer cette mention avant signature.",
  },
  penalite_annulation_excessive: {
    titre: "Pénalité d'annulation possiblement excessive",
    explication:
      "Une pénalité d'annulation > 15 % du montant du devis peut être considérée comme abusive (article L212-1 du Code de la consommation sur les clauses abusives). " +
      "Demandez à l'artisan une justification de cette pénalité (frais réellement engagés). En cas de litige, vous pouvez saisir la DGCCRF ou un médiateur de la consommation.",
  },
  soustraitance_libre: {
    titre: "Sous-traitance sans accord préalable",
    explication:
      "Cette clause autorise l'artisan à sous-traiter sans votre accord explicite. " +
      "Demandez la liste des sous-traitants potentiels et exigez par écrit qu'aucune sous-traitance ne soit faite sans votre accord (loi du 31 décembre 1975 sur la sous-traitance). " +
      "Vérifiez que la garantie décennale couvrira les travaux du sous-traitant.",
  },
  modification_unilaterale: {
    titre: "Modification du prix sans accord",
    explication:
      "Cette clause permet à l'artisan de modifier le prix ou les conditions sans votre accord. " +
      "Un devis SIGNÉ vaut contrat et ne peut être modifié unilatéralement (article 1193 du Code civil). Tout supplément doit faire l'objet d'un avenant signé par les 2 parties. " +
      "Demandez à l'artisan de retirer cette mention avant signature.",
  },
};

export default function BlockClausesLitigieuses({ clauses }: Props) {
  if (!clauses || clauses.length === 0) return null;

  const hasRouge = clauses.some(c => c.gravite === "rouge");
  const containerCls = hasRouge
    ? "border-red-200 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900"
    : "border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-900";
  const headerColor = hasRouge ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300";
  const titleText = hasRouge
    ? "⚠️ Clauses contractuelles à vérifier avant de signer"
    : "ℹ️ Clauses à clarifier avec l'artisan";

  return (
    <div className={`border-2 rounded-2xl p-3 sm:p-6 mb-6 ${containerCls}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="p-2 sm:p-3 bg-background/50 rounded-xl flex-shrink-0">
          <FileWarning className={`h-5 w-5 sm:h-6 sm:w-6 ${headerColor}`} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className={`font-bold text-xl mb-2 ${headerColor}`}>{titleText}</h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Le texte de votre devis contient {clauses.length === 1 ? "une mention" : "des mentions"} qui {clauses.length === 1 ? "mérite" : "méritent"} d'être examinée{clauses.length > 1 ? "s" : ""} avant signature.
            {hasRouge && " Une ou plusieurs clauses pourraient être contraires au droit de la consommation."}
          </p>

          <div className="space-y-3">
            {clauses.map((clause, idx) => {
              const label = CLAUSE_LABELS[clause.type];
              const itemCls = clause.gravite === "rouge"
                ? "border-red-200 bg-white dark:bg-red-950/30 dark:border-red-900"
                : "border-amber-200 bg-white dark:bg-amber-950/30 dark:border-amber-900";
              const iconColor = clause.gravite === "rouge" ? "text-red-600" : "text-amber-600";

              return (
                <div key={idx} className={`rounded-xl border ${itemCls} p-3 sm:p-4`}>
                  <div className="flex items-start gap-2.5 mb-2">
                    <AlertTriangle className={`h-4 w-4 ${iconColor} flex-shrink-0 mt-0.5`} aria-hidden="true" />
                    <h3 className="font-semibold text-foreground text-sm leading-tight">{label.titre}</h3>
                  </div>
                  <div className="ml-6">
                    <blockquote className="border-l-2 border-muted-foreground/40 pl-3 mb-2 text-xs italic text-muted-foreground leading-relaxed">
                      « {clause.citation} »
                    </blockquote>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      {label.explication}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground italic mt-4 leading-relaxed">
            ℹ️ Cette analyse est automatisée par lecture du texte du devis. Pour un avis juridique précis sur votre situation, consultez un médiateur de la consommation, la DGCCRF (signal.conso.gouv.fr), ou un avocat.
          </p>
        </div>
      </div>
    </div>
  );
}
