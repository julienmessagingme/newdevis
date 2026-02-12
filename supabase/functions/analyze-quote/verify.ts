import type { ExtractedData, VerificationResult, CompanyPayload, ScoringColor } from "./types.ts";
import {
  extractSiren,
  getCountryName,
  PAPPERS_API_URL,
  OPENIBAN_API_URL,
  GOOGLE_PLACES_API_URL,
  ADEME_RGE_API_URL,
  GEORISQUES_API_URL,
  ADRESSE_API_URL,
  GPU_API_URL,
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
    capitaux_propres: null,
    capitaux_propres_negatifs: null,
    date_creation: null,
    anciennete_annees: null,
    bilans_disponibles: 0,
    nom_officiel: null,
    adresse_officielle: null,
    ville_officielle: null,
    lookup_status: "skipped",
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
        pappers: {
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

  // 1. PAPPERS - Company verification
  const siret = extracted.entreprise.siret;
  const siren = extractSiren(siret);

  if (siret && siren) {
    result.debug!.provider_calls.pappers.enabled = true;

    // Check cache first
    const { data: cached } = await supabase
      .from("company_cache")
      .select("*")
      .eq("siret", siret)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (cached) {
      console.log("Cache HIT for SIRET:", siret);
      result.debug!.provider_calls.pappers.cached = true;
      result.debug!.provider_calls.pappers.cache_hit = true;

      if (cached.status === "ok") {
        const payload = cached.payload as CompanyPayload;
        result.entreprise_immatriculee = payload.is_active;
        result.entreprise_radiee = !payload.is_active;
        result.procedure_collective = payload.procedure_collective;
        result.date_creation = payload.date_creation;
        result.anciennete_annees = payload.age_years;
        result.bilans_disponibles = payload.bilans_count;
        result.capitaux_propres = payload.last_bilan_capitaux_propres;
        result.capitaux_propres_negatifs = payload.last_bilan_capitaux_propres !== null
          ? payload.last_bilan_capitaux_propres < 0
          : null;
        result.nom_officiel = payload.nom;
        result.adresse_officielle = payload.adresse;
        result.ville_officielle = payload.ville;
        result.lookup_status = "ok";
      } else if (cached.status === "not_found") {
        result.lookup_status = "not_found";
      } else {
        result.lookup_status = "error";
        result.debug!.provider_calls.pappers.error = cached.error_message;
      }
    } else {
      // Call Pappers API
      result.debug!.provider_calls.pappers.attempted = true;
      const pappersKey = Deno.env.get("PAPPERS_API_KEY");

      if (pappersKey) {
        const startTime = Date.now();
        try {
          const pappersUrl = `${PAPPERS_API_URL}/entreprise?siret=${siret}&api_token=${pappersKey}`;
          const pappersResponse = await fetch(pappersUrl);

          result.debug!.provider_calls.pappers.http_status = pappersResponse.status;
          result.debug!.provider_calls.pappers.latency_ms = Date.now() - startTime;
          result.debug!.provider_calls.pappers.fetched_at = new Date().toISOString();
          result.debug!.provider_calls.pappers.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

          if (pappersResponse.ok) {
            const data = await pappersResponse.json();

            const dateCreation = data.date_creation || null;
            let ageYears: number | null = null;
            if (dateCreation) {
              const created = new Date(dateCreation);
              ageYears = Math.floor((Date.now() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            }

            const bilans = data.finances || [];
            const lastBilan = bilans[0];
            const capitauxPropres = lastBilan?.capitaux_propres ?? null;

            const payload: CompanyPayload = {
              date_creation: dateCreation,
              age_years: ageYears,
              is_active: data.entreprise_cessee !== true,
              bilans_count: bilans.length,
              has_3_bilans: bilans.length >= 3,
              last_bilan_capitaux_propres: capitauxPropres,
              nom: data.nom_entreprise || data.denomination || null,
              adresse: data.siege?.adresse_ligne_1 || null,
              ville: data.siege?.ville || null,
              procedure_collective: data.procedure_collective === true,
            };

            // Cache the result
            await supabase.from("company_cache").upsert({
              siret,
              siren,
              provider: "pappers",
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
            result.bilans_disponibles = payload.bilans_count;
            result.capitaux_propres = payload.last_bilan_capitaux_propres;
            result.capitaux_propres_negatifs = capitauxPropres !== null ? capitauxPropres < 0 : null;
            result.nom_officiel = payload.nom;
            result.adresse_officielle = payload.adresse;
            result.ville_officielle = payload.ville;
            result.lookup_status = "ok";

          } else if (pappersResponse.status === 404) {
            result.lookup_status = "not_found";

            await supabase.from("company_cache").upsert({
              siret,
              siren,
              provider: "pappers",
              payload: {},
              status: "not_found",
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day for not_found
            }, { onConflict: "siret" });

          } else {
            result.lookup_status = "error";
            result.debug!.provider_calls.pappers.error = `API returned ${pappersResponse.status}`;

            await supabase.from("company_cache").upsert({
              siret,
              siren,
              provider: "pappers",
              payload: {},
              status: "error",
              error_code: `HTTP_${pappersResponse.status}`,
              error_message: `API returned ${pappersResponse.status}`,
              fetched_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour for errors
            }, { onConflict: "siret" });
          }
        } catch (error) {
          result.lookup_status = "error";
          result.debug!.provider_calls.pappers.error = error instanceof Error ? error.message : "Unknown error";
          result.debug!.provider_calls.pappers.latency_ms = Date.now() - startTime;
        }
      } else {
        result.debug!.provider_calls.pappers.error = "API key not configured";
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
      console.error("OpenIBAN error:", error);
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
      console.error("Google Places error:", error);
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
      console.error("RGE API error:", error);
    }
  }

  // 5. Géorisques - Site context
  const codePostal = extracted.client.code_postal;
  if (codePostal) {
    try {
      // Get coordinates from address
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

              // Zone sismique - endpoint séparé
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
      console.error("Géorisques error:", error);
    }
  }

  // 6. Price comparisons
  if (extracted.travaux.length > 0 && codePostal) {
    // Get zone coefficient
    const prefix = codePostal.substring(0, 2);
    const { data: zoneData } = await supabase
      .from("zones_geographiques")
      .select("type_zone, coefficient")
      .eq("prefixe_postal", prefix)
      .single();

    const zoneType = zoneData?.type_zone || "france_moyenne";
    const coefficient = zoneData?.coefficient || 1.0;

    for (const travail of extracted.travaux) {
      if (travail.montant && travail.quantite && travail.quantite > 0) {
        const prixUnitaire = travail.montant / travail.quantite;

        // Get reference prices
        const { data: refPrix } = await supabase
          .from("travaux_reference_prix")
          .select("prix_min_national, prix_max_national, unite")
          .ilike("categorie_travaux", `%${travail.categorie}%`)
          .limit(1)
          .single();

        let score: ScoringColor = "VERT";
        let explication = "Prestation spécifique - pas de référence standardisée disponible";
        let fourchetteMin = 0;
        let fourchetteMax = 0;

        if (refPrix) {
          fourchetteMin = refPrix.prix_min_national * coefficient;
          fourchetteMax = refPrix.prix_max_national * coefficient;

          if (prixUnitaire < fourchetteMin * 0.7) {
            score = "VERT";
            explication = `Prix unitaire (${prixUnitaire.toFixed(2)}€/${travail.unite || "u"}) inférieur à la fourchette basse`;
          } else if (prixUnitaire <= fourchetteMax * 1.3) {
            score = "VERT";
            explication = `Prix unitaire dans la fourchette de marché`;
          } else {
            score = "VERT"; // Price never downgrades score per new rules
            explication = `Prix unitaire au-dessus de la fourchette haute - à contextualiser`;
          }
        }

        result.comparaisons_prix.push({
          categorie: travail.categorie,
          libelle: travail.libelle,
          prix_unitaire_devis: prixUnitaire,
          fourchette_min: fourchetteMin,
          fourchette_max: fourchetteMax,
          zone: zoneType,
          score,
          explication,
        });
      }
    }
  }

  console.log("PHASE 2 COMPLETE - Verification:", {
    immatriculee: result.entreprise_immatriculee,
    procedure_collective: result.procedure_collective,
    capitaux_negatifs: result.capitaux_propres_negatifs,
    iban_valide: result.iban_valide,
    google_note: result.google_note,
    pappers_cached: result.debug?.provider_calls.pappers.cache_hit,
  });

  return result;
}
