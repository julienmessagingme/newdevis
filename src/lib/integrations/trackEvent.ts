/**
 * src/lib/integrations/trackEvent.ts
 *
 * 2026-09-07 — signal d'usage anonyme, côté client.
 *
 * Sert à répondre à une question précise : les calculettes sont-elles
 * utilisées ? Une vue de page ne le dit pas — on veut le nombre de RÉSULTATS
 * produits. La décision de les garder ou non se prend sur ce chiffre.
 *
 * Ne transmet QUE le nom de l'événement : jamais les valeurs saisies (code
 * postal, surface, type de travaux). Cf. `/api/track/event` pour le régime
 * RGPD et l'allowlist.
 *
 * ⚠️ Pas de consentement cookies requis, et c'est volontaire : cette mesure
 * n'utilise ni cookie ni identifiant persistant (empreinte serveur rotative
 * quotidienne), elle relève de l'exemption CNIL pour la seule mesure
 * d'audience — au même titre que le beacon de visite de `BaseLayout`. Les
 * pixels publicitaires, eux, restent gatés sur le consentement.
 */

/** Événements mesurés. Doit rester aligné avec l'allowlist de la route. */
export type EvenementUsage =
  | "calculette_travaux_calcul"
  | "simulateur_valorisation_calcul"
  | "simulateur_aides_calcul";

export function trackEvent(event: EvenementUsage): void {
  if (typeof window === "undefined") return;
  try {
    // Le trafic de l'équipe n'est jamais compté — même garde que le beacon de
    // visite, sinon nos propres essais gonfleraient le chiffre qui sert
    // justement à décider du sort de ces pages.
    if (localStorage.getItem("vmd_internal") === "1") return;
  } catch {
    /* localStorage indisponible (navigation privée) : on mesure quand même. */
  }

  try {
    const corps = JSON.stringify({
      event,
      site: window.location.hostname.includes("gerermonchantier") ? "gmc" : "vmd",
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track/event", new Blob([corps], { type: "application/json" }));
    } else {
      void fetch("/api/track/event", {
        method: "POST",
        body: corps,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    }
  } catch {
    /* la mesure ne doit jamais casser une interaction */
  }
}
