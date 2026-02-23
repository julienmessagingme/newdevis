import { useState, useMemo } from "react";
import { ExternalLink, ChevronDown, ChevronUp, Info, MapPin } from "lucide-react";
import {
  detectUrbanismeCategories,
  computeDemarcheSimple,
  type DetectedCategory,
  type DemarcheInputs,
  type DemarcheItem,
} from "@/lib/urbanismeUtils";

interface UrbanismeAssistantProps {
  rawText?: string | null;
  workType?: string | null;
  commune?: string | null;
  patrimoineStatus?: string | null;
}

const CATEGORY_LABELS: Record<DetectedCategory, string> = {
  extension: "Extension",
  piscine: "Piscine",
  cloture: "Clôture",
  abri_jardin: "Abri jardin",
  facade: "Façade/Toiture",
  construction_neuve: "Construction neuve",
};

const DEMARCHE_COLOR: Record<DemarcheItem["probable_demarche"], string> = {
  "DP probable": "border-score-orange/30 bg-score-orange-bg",
  "PC probable": "border-score-orange/30 bg-score-orange-bg",
  "DP ou PC probable": "border-score-orange/30 bg-score-orange-bg",
  "Aucune formalité probable": "border-score-green/30 bg-score-green-bg",
};

const DEMARCHE_TEXT_COLOR: Record<DemarcheItem["probable_demarche"], string> = {
  "DP probable": "text-score-orange",
  "PC probable": "text-score-orange",
  "DP ou PC probable": "text-score-orange",
  "Aucune formalité probable": "text-score-green",
};

function DemarcheCard({ item }: { item: DemarcheItem }) {
  const borderBg = DEMARCHE_COLOR[item.probable_demarche] ?? "border-border bg-muted";
  const textColor = DEMARCHE_TEXT_COLOR[item.probable_demarche] ?? "text-foreground";

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${borderBg}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{item.label}</span>
        <span className={`text-sm font-bold whitespace-nowrap ${textColor}`}>
          {item.probable_demarche}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{item.explanation}</p>
      {item.warnings && item.warnings.length > 0 && (
        <ul className="space-y-1">
          {item.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <span className="flex-shrink-0">⚠️</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      {(item.link_dp || item.link_pc) && (
        <div className="flex flex-wrap gap-3 pt-1">
          {item.link_dp && (
            <a
              href={item.link_dp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 underline"
            >
              Formulaire DP
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {item.link_pc && (
            <a
              href={item.link_pc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 underline"
            >
              Formulaire PC
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function UrbanismeAssistant({
  rawText,
  workType,
  commune,
  patrimoineStatus,
}: UrbanismeAssistantProps) {
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form state
  const [surfaceCreee, setSurfaceCreee] = useState("");
  const [surfaceActuelle, setSurfaceActuelle] = useState("");
  const [surfaceTotaleApres, setSurfaceTotaleApres] = useState("");
  const [surfaceBassin, setSurfaceBassin] = useState("");
  const [hauteurCloture, setHauteurCloture] = useState("");

  // "Je ne sais pas" checkboxes
  const [unknownCreee, setUnknownCreee] = useState(false);
  const [unknownActuelle, setUnknownActuelle] = useState(false);
  const [unknownTotale, setUnknownTotale] = useState(false);
  const [unknownBassin, setUnknownBassin] = useState(false);
  const [unknownCloture, setUnknownCloture] = useState(false);

  const detection = useMemo(
    () => detectUrbanismeCategories(rawText ?? null, workType ?? null),
    [rawText, workType]
  );

  const hasPiscine = detection.categories.includes("piscine");
  const hasCloture = detection.categories.includes("cloture");
  const hasExtensionOrAbri = detection.categories.some((c) =>
    ["extension", "abri_jardin"].includes(c)
  );
  const hasExtension = detection.categories.includes("extension");
  const hasRelevantCategories = detection.categories.length > 0;
  const isPatrimoine = patrimoineStatus === "possible";

  const gpuUrl = commune
    ? `https://www.geoportail-urbanisme.gouv.fr/map/#tile=16&zoom=15&city=${encodeURIComponent(commune)}`
    : "https://www.geoportail-urbanisme.gouv.fr/";

  const inputs: DemarcheInputs = {
    surface_creee: unknownCreee ? null : surfaceCreee ? parseFloat(surfaceCreee) : null,
    surface_actuelle: unknownActuelle ? null : surfaceActuelle ? parseFloat(surfaceActuelle) : null,
    surface_totale_apres: unknownTotale ? null : surfaceTotaleApres ? parseFloat(surfaceTotaleApres) : null,
    surface_bassin: unknownBassin ? null : surfaceBassin ? parseFloat(surfaceBassin) : null,
    hauteur_cloture: unknownCloture ? null : hauteurCloture ? parseFloat(hauteurCloture) : null,
  };

  const result = submitted ? computeDemarcheSimple(detection, inputs) : null;

  const handleToggleAccordion = () => {
    setAccordionOpen((v) => !v);
    if (accordionOpen) setSubmitted(false);
  };

  return (
    <div className="mt-5 space-y-3">
      {/* Section header */}
      <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
        <MapPin className="h-4 w-4 text-primary" />
        Urbanisme &amp; Démarches
      </h3>

      {/* GPU Link card */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50/70 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
        <ExternalLink className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            Vérifier les règles d'urbanisme applicables
          </p>
          {commune && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
              Commune détectée : <span className="font-medium">{commune}</span>
            </p>
          )}
          <a
            href={gpuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200 underline"
          >
            Géoportail de l'Urbanisme (GPU)
            <ExternalLink className="h-3 w-3" />
          </a>
          <p className="text-xs text-blue-500 dark:text-blue-500 mt-0.5">
            PLU, zonage, secteurs protégés — source officielle IGN/MTES
          </p>
        </div>
      </div>

      {/* Patrimoine warning */}
      {isPatrimoine && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
          <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Ce chantier est situé à proximité d'un patrimoine protégé (monument historique / site remarquable). L'accord préalable de l'Architecte des Bâtiments de France (ABF) est probablement requis pour les travaux extérieurs.
          </p>
        </div>
      )}

      {/* Accordion: Estimer la démarche */}
      {hasRelevantCategories && (
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={handleToggleAccordion}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
          >
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-sm font-medium text-foreground whitespace-nowrap">
                Estimer la démarche
              </span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">(optionnel)</span>
              <div className="flex gap-1 flex-wrap">
                {detection.categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary font-medium"
                  >
                    {CATEGORY_LABELS[cat]}
                  </span>
                ))}
              </div>
            </div>
            {accordionOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
            )}
          </button>

          {accordionOpen && (
            <div className="p-4 space-y-4 border-t border-border">
              {!submitted ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Renseignez les informations disponibles pour obtenir une estimation indicative de la démarche probable. Tous les champs sont optionnels.
                  </p>

                  {/* Surface créée — extension ou abri jardin */}
                  {hasExtensionOrAbri && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Surface créée (m²)
                      </label>
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          type="number"
                          min="0"
                          value={unknownCreee ? "" : surfaceCreee}
                          onChange={(e) => setSurfaceCreee(e.target.value)}
                          disabled={unknownCreee}
                          placeholder="ex : 20"
                          className="w-28 px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={unknownCreee}
                            onChange={(e) => {
                              setUnknownCreee(e.target.checked);
                              if (e.target.checked) setSurfaceCreee("");
                            }}
                            className="rounded"
                          />
                          Je ne sais pas
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Surface actuelle — extension uniquement */}
                  {hasExtension && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Surface actuelle du logement (m²)
                      </label>
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          type="number"
                          min="0"
                          value={unknownActuelle ? "" : surfaceActuelle}
                          onChange={(e) => setSurfaceActuelle(e.target.value)}
                          disabled={unknownActuelle}
                          placeholder="ex : 100"
                          className="w-28 px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={unknownActuelle}
                            onChange={(e) => {
                              setUnknownActuelle(e.target.checked);
                              if (e.target.checked) setSurfaceActuelle("");
                            }}
                            className="rounded"
                          />
                          Je ne sais pas
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Surface totale après travaux — extension uniquement */}
                  {hasExtension && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Surface totale après travaux (m²)
                      </label>
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          type="number"
                          min="0"
                          value={unknownTotale ? "" : surfaceTotaleApres}
                          onChange={(e) => setSurfaceTotaleApres(e.target.value)}
                          disabled={unknownTotale}
                          placeholder="ex : 120"
                          className="w-28 px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={unknownTotale}
                            onChange={(e) => {
                              setUnknownTotale(e.target.checked);
                              if (e.target.checked) setSurfaceTotaleApres("");
                            }}
                            className="rounded"
                          />
                          Je ne sais pas
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Surface bassin — piscine */}
                  {hasPiscine && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Surface du bassin (m²)
                      </label>
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          type="number"
                          min="0"
                          value={unknownBassin ? "" : surfaceBassin}
                          onChange={(e) => setSurfaceBassin(e.target.value)}
                          disabled={unknownBassin}
                          placeholder="ex : 40"
                          className="w-28 px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={unknownBassin}
                            onChange={(e) => {
                              setUnknownBassin(e.target.checked);
                              if (e.target.checked) setSurfaceBassin("");
                            }}
                            className="rounded"
                          />
                          Je ne sais pas
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Hauteur clôture */}
                  {hasCloture && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Hauteur de la clôture (m)
                      </label>
                      <div className="flex items-center gap-3 flex-wrap">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={unknownCloture ? "" : hauteurCloture}
                          onChange={(e) => setHauteurCloture(e.target.value)}
                          disabled={unknownCloture}
                          placeholder="ex : 1.8"
                          className="w-28 px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40"
                        />
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={unknownCloture}
                            onChange={(e) => {
                              setUnknownCloture(e.target.checked);
                              if (e.target.checked) setHauteurCloture("");
                            }}
                            className="rounded"
                          />
                          Je ne sais pas
                        </label>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setSubmitted(true)}
                    className="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors mt-2"
                  >
                    Estimer la démarche probable
                  </button>
                </>
              ) : result ? (
                <>
                  <div className="space-y-3">
                    {result.items.map((item) => (
                      <DemarcheCard key={item.category} item={item} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground italic border-t border-border pt-3 mt-2">
                    {result.disclaimer}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="text-xs text-primary hover:underline"
                  >
                    ← Modifier les informations
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
