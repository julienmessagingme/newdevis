import type { ExtractedData, VerificationResult, CompanyPayload, ScoringColor, FinancialRatios } from "./types.ts";
import {
  extractSiren,
  getCountryName,
  OPENIBAN_API_URL,
  GOOGLE_PLACES_API_URL,
  ADEME_RGE_API_URL,
  GEORISQUES_API_URL,
  ADRESSE_API_URL,
  GPU_API_URL,
  RECHERCHE_ENTREPRISES_API_URL,
  DATA_ECONOMIE_API_URL,
} from "./utils.ts";

// ============================================================
// PHASE 2: VERIFICATION (all the API calls)
// ============================================================

export async function verifyData(
  extracted: ExtractedData,
  supabase: any
): Promise<VerificationResult> {

  const result: VerificationResult = {
    entreprise_immatriculee: null,
    entreprise_radiee: null,
    procedure_collective: null,
    date_creation: null,
    anciennete_annees: null,
    nom_officiel: null,
    adresse_officielle: null,
    ville_officielle: null,
    lookup_status: "skipped",
    finances: [],
    finances_status: "skipped",
    iban_verifie: false,
    iban_valide: null,
    iban_pays: null,
    iban_code_pays: null,
    iban_banque: null,
    rge_pertinent: false,
    rge_trouve: false,
    rge_qualifications: [],
    google_trouve: false,
    google_note: null,
    google_nb_avis: null,
    google_match_fiable: false,
    georisques_consulte: false,
    georisques_risques: [],
    georisques_zone_sismique: null,
    georisques_commune: null,
    patrimoine_consulte: false,
    patrimoine_status: "inconnu",
    patrimoine_types: [],
    patrimoine_lat: null,
    patrimoine_lon: null,
    comparaisons_prix: [],
    debug: {
      provider_calls: {
        entreprise: {
          enabled: false,
          attempted: false,
          cached: false,
          cache_hit: false,
          http_status: null,
          error: null,
          fetched_at: null,
          expires_at: null,
          latency_ms: null,
        },
        finances: {
          enabled: false,
          attempted: false,
          cached: false,
          cache_hit: false,
          http_status: null,
          error: null,
          fetched_at: null,
          expires_at: null,
          latency_ms: null,
        },
      },
    },
  };

  console.log("PHASE 2 - Starting verification...");

  // 1. RECHERCHE ENTREPRISES API GOUV — Company verification
  const siret = extracted.entreprise.siret;
  const siren = extractSiren(siret);

  if (siret && siren) {
    result.debug!.provider_calls.entreprise.enabled = true;

    // Check cache first
    const { data: cached } = await supabase
      .from("company_cache")
      .select("*")
      .eq("siret", siret)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (cached) {
      console.log("Cache HIT for SIRET:", siret);
      result.debug!.provider_calls.entreprise.cached = true;
      result.debug!.provider_calls.entreprise.cache_hit = true;

      if (cached.status === "ok") {
        const payload = cached.payload as CompanyPayload;
        result.entreprise_immatriculee = payload.is_active;
        result.entreprise_radiee = !payload.is_active;
        result.procedure_collective = payload.procedure_collective;
        result.date_creation = payload.date_creation;
        result.anciennete_annees = payload.age_years;
        result.nom_officiel = payload.nom;
        result.adresse_officielle = payload.adresse;
        result.ville_officielle = payload.ville;
        result.lookup_status = "ok";
      } else if (cached.status === "not_found") {
        result.lookup_status = "not_found";
      } else {
        result.lookup_status = "error";
        result.debug!.provider_calls.entreprise.error = cached.error_message;
      }
    } else {
      // Call recherche-entreprises.api.gouv.fr
      result.debug!.provider_calls.entreprise.attempted = true;
      const startTime = Date.now();

      try {
        const apiUrl = `${RECHERCHE_ENTREPRISES_API_URL}?q=${siret}&page=1&per_page=1`;
        const response = await fetch(apiUrl);

        result.debug!.provider_calls.entreprise.http_status = response.status;
        result.debug!.provider_calls.entreprise.latency_ms = Date.now() - startTime;
        result.debug!.provider_calls.entreprise.fetched_at = new Date().toISOString();
        result.debug!.provider_calls.entreprise.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        if (response.ok) {
          const data = await response.json();
          const entreprise = data.results?.[0];

          if (entreprise) {
            const dateCreation = entreprise.date_creation || null;
            let ageYears: number | null = null;
            if (dateCreation) {
              const created = new Date(dateCreation);
              ageYears = Math.floor((Date.now() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            }

            const isActive = entreprise.etat_administratif === "A";
            const siege = entreprise.siege || {};

            const payload: CompanyPayload = {
              date_creation: dateCreation,
              age_years: ageYears,
              is_active: isActive,
              nom: entreprise.nom_complet || entreprise.nom_raison_sociale || null,
              adresse: siege.adresse || (siege.libelle_voie ? `${siege.numero_voie || ""} ${siege.type_voie || ""} ${siege.libelle_voie || ""}`.trim() : null),
              ville: siege.libelle_commune || siege.commune || null,
              procedure_collective: entreprise.est_en_procedure_collective === true,
            };

            // Cache the result
            await supabase.from("company_cache").upsert({
              siret,
              siren,
              provider: "recherche-entreprises",
              payload,
              status: "ok",
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }, { onConflict: "siret" });

            result.entreprise_immatriculee = payload.is_active;
            result.entreprise_radiee = !payload.is_active;
            result.procedure_collective = payload.procedure_collective;
            result.date_creation = payload.date_creation;
            result.anciennete_annees = payload.age_years;
            result.nom_officiel = payload.nom;
            result.adresse_officielle = payload.adresse;
            result.ville_officielle = payload.ville;
            result.lookup_status = "ok";

            console.log("[Verify] API gouv found:", payload.nom, "| active:", payload.is_active, "| age:", payload.age_years, "years");
          } else {
            result.lookup_status = "not_found";

            await supabase.from("company_cache").upsert({
              siret,
              siren,
              provider: "recherche-entreprises",
              payload: {},
              status: "not_found",
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }, { onConflict: "siret" });
          }
        } else {
          result.lookup_status = "error";
          result.debug!.provider_calls.entreprise.error = `API returned ${response.status}`;
        }
      } catch (error) {
        result.lookup_status = "error";
        result.debug!.provider_calls.entreprise.error = error instanceof Error ? error.message : "Unknown error";
        result.debug!.provider_calls.entreprise.latency_ms = Date.now() - startTime;
      }
    }

    // 1b. DATA.ECONOMIE.GOUV.FR — Financial ratios
    if (siren) {
      result.debug!.provider_calls.finances.enabled = true;
      result.debug!.provider_calls.finances.attempted = true;
      const startTimeFinances = Date.now();

      try {
        const financesUrl = `${DATA_ECONOMIE_API_URL}?dataset=ratios_inpi_bce&q=siren:${siren}&rows=5&sort=date_cloture_exercice`;
        const financesResponse = await fetch(financesUrl);

        result.debug!.provider_calls.finances.http_status = financesResponse.status;
        result.debug!.provider_calls.finances.latency_ms = Date.now() - startTimeFinances;
        result.debug!.provider_calls.finances.fetched_at = new Date().toISOString();

        if (financesResponse.ok) {
          const financesData = await financesResponse.json();
          const records = financesData.records || [];

          if (records.length > 0) {
            result.finances = records.map((r: any) => {
              const f = r.fields || {};
              return {
                date_cloture: f.date_cloture_exercice || "",
                chiffre_affaires: f.chiffre_d_affaires ?? null,
                resultat_net: f.resultat_net ?? null,
                taux_endettement: f.taux_d_endettement ?? null,
                ratio_liquidite: f.ratio_de_liquidite ?? null,
                autonomie_financiere: f.autonomie_financiere ?? null,
                capacite_remboursement: f.capacite_de_remboursement ?? null,
                marge_ebe: f.marge_ebe ?? null,
              } as FinancialRatios;
            });
            result.finances_status = "ok";
            console.log("[Verify] Financial ratios found:", records.length, "year(s) for SIREN:", siren);
          } else {
            result.finances_status = "not_found";
            console.log("[Verify] No financial ratios for SIREN:", siren);
          }
        } else {
          result.finances_status = "error";
          result.debug!.provider_calls.finances.error = `API returned ${financesResponse.status}`;
        }
      } catch (error) {
        result.finances_status = "error";
        result.debug!.provider_calls.finances.error = error instanceof Error ? error.message : "Unknown error";
        result.debug!.provider_calls.finances.latency_ms = Date.now() - startTimeFinances;
      }
    }
  } else {
    result.lookup_status = "no_siret";
  }

  // 2. OpenIBAN - IBAN validation
  if (extracted.entreprise.iban) {
    try {
      const ibanClean = extracted.entreprise.iban.replace(/\s/g, "");
      const ibanResponse = await fetch(`${OPENIBAN_API_URL}/${ibanClean}?getBIC=true`);

      if (ibanResponse.ok) {
        const ibanData = await ibanResponse.json();
        result.iban_verifie = true;
        result.iban_valide = ibanData.valid === true;
        result.iban_code_pays = ibanClean.substring(0, 2);
        result.iban_pays = getCountryName(result.iban_code_pays);
        result.iban_banque = ibanData.bankData?.name || null;
      }
    } catch (error) {
      const safeMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("OpenIBAN error:", safeMsg);
    }
  }

  // 3. Google Places - Reputation
  const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (googleApiKey && extracted.entreprise.nom) {
    try {
      const searchQuery = encodeURIComponent(`${extracted.entreprise.nom} entreprise`);
      const placesUrl = `${GOOGLE_PLACES_API_URL}?input=${searchQuery}&inputtype=textquery&fields=name,rating,user_ratings_total&key=${googleApiKey}`;

      const placesResponse = await fetch(placesUrl);
      if (placesResponse.ok) {
        const placesData = await placesResponse.json();
        if (placesData.candidates && placesData.candidates.length > 0) {
          const place = placesData.candidates[0];
          result.google_trouve = true;
          result.google_note = place.rating || null;
          result.google_nb_avis = place.user_ratings_total || null;
          result.google_match_fiable = true;
        }
      }
    } catch (error) {
      const safeMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Google Places error:", safeMsg);
    }
  }

  // 4. RGE - Qualifications
  const workCategories = extracted.travaux.map(t => t.categorie.toLowerCase());
  const rgeRelevantCategories = ["isolation", "chauffage", "pompe à chaleur", "pac", "solaire", "photovoltaique", "renovation_energetique"];
  result.rge_pertinent = workCategories.some(cat =>
    rgeRelevantCategories.some(rge => cat.includes(rge) || rge.includes(cat))
  );

  if (result.rge_pertinent && siren) {
    try {
      const rgeResponse = await fetch(`${ADEME_RGE_API_URL}?q=${siren}&size=5`);
      if (rgeResponse.ok) {
        const rgeData = await rgeResponse.json();
        if (rgeData.results && rgeData.results.length > 0) {
          result.rge_trouve = true;
          result.rge_qualifications = rgeData.results.map((r: any) => r.nom_qualification || r.qualification).filter(Boolean);
        }
      }
    } catch (error) {
      const safeMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("RGE API error:", safeMsg);
    }
  }

  // 5. Géorisques - Site context
  const codePostal = extracted.client.code_postal;
  if (codePostal) {
    try {
      const adresseQuery = extracted.client.adresse_chantier
        ? `${extracted.client.adresse_chantier} ${codePostal} ${extracted.client.ville || ""}`
        : `${codePostal} ${extracted.client.ville || ""}`;

      const geoResponse = await fetch(`${ADRESSE_API_URL}?q=${encodeURIComponent(adresseQuery)}&limit=1`);
      if (geoResponse.ok) {
        const geoData = await geoResponse.json();
        if (geoData.features && geoData.features.length > 0) {
          const [lon, lat] = geoData.features[0].geometry.coordinates;
          const commune = geoData.features[0].properties.city || geoData.features[0].properties.label;

          result.patrimoine_lat = lat;
          result.patrimoine_lon = lon;
          result.georisques_commune = commune;
          const codeInsee = geoData.features[0].properties.citycode || "";

          // Georisques API - Risques GASPAR
          if (codeInsee) {
            try {
              const risquesResponse = await fetch(`${GEORISQUES_API_URL}/gaspar/risques?code_insee=${codeInsee}`);
              if (risquesResponse.ok) {
                const risquesData = await risquesResponse.json();
                result.georisques_consulte = true;

                if (risquesData.data && risquesData.data.length > 0 && risquesData.data[0].risques_detail) {
                  result.georisques_risques = risquesData.data[0].risques_detail
                    .map((r: any) => r.libelle_risque_long || r.libelle_risque || r.type)
                    .filter(Boolean);
                }
              }

              // Zone sismique
              const seismeResponse = await fetch(`${GEORISQUES_API_URL}/zonage_sismique?code_insee=${codeInsee}`);
              if (seismeResponse.ok) {
                const seismeData = await seismeResponse.json();
                if (seismeData.data && seismeData.data.length > 0) {
                  result.georisques_zone_sismique = seismeData.data[0].zone_sismicite || null;
                }
              }
            } catch (georisquesError) {
              console.error("Georisques API error:", georisquesError);
            }
          }

          // GPU API for heritage
          try {
            const gpuResponse = await fetch(`${GPU_API_URL}?lat=${lat}&lon=${lon}`);
            if (gpuResponse.ok) {
              const gpuData = await gpuResponse.json();
              result.patrimoine_consulte = true;

              if (gpuData.features && gpuData.features.length > 0) {
                const heritageTypes = gpuData.features
                  .filter((f: any) => f.properties?.typepsc?.includes("monument") || f.properties?.typepsc?.includes("patrimoine"))
                  .map((f: any) => f.properties?.libelle || f.properties?.typepsc);

                if (heritageTypes.length > 0) {
                  result.patrimoine_status = "possible";
                  result.patrimoine_types = heritageTypes;
                } else {
                  result.patrimoine_status = "non_detecte";
                }
              } else {
                result.patrimoine_status = "non_detecte";
              }
            }
          } catch (gpuError) {
            console.error("GPU API error:", gpuError);
          }
        }
      }
    } catch (error) {
      const safeMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Géorisques error:", safeMsg);
    }
  }

  // 6. Price comparisons (zone coefficient only)
  if (extracted.travaux.length > 0 && codePostal) {
    const prefix = codePostal.substring(0, 2);
    const { data: zoneData } = await supabase
      .from("zones_geographiques")
      .select("type_zone, coefficient")
      .eq("prefixe_postal", prefix)
      .single();

    const zoneType = zoneData?.type_zone || "france_moyenne";

    for (const travail of extracted.travaux) {
      if (travail.montant && travail.quantite && travail.quantite > 0) {
        const prixUnitaire = travail.montant / travail.quantite;

        result.comparaisons_prix.push({
          categorie: travail.categorie,
          libelle: travail.libelle,
          prix_unitaire_devis: prixUnitaire,
          fourchette_min: 0,
          fourchette_max: 0,
          zone: zoneType,
          score: "VERT" as ScoringColor,
          explication: "Prestation spécifique - pas de référence standardisée disponible",
        });
      }
    }
  }

  console.log("PHASE 2 COMPLETE - Verification:", {
    immatriculee: result.entreprise_immatriculee,
    procedure_collective: result.procedure_collective,
    finances_years: result.finances.length,
    iban_valide: result.iban_valide,
    google_note: result.google_note,
    cached: result.debug?.provider_calls.entreprise.cache_hit,
  });

  return result;
}
