// ============================================================
// VMD — Templates email onboarding (clone du moteur GMC `gmc-emails.ts`).
// Meme layout maitre email-safe (tables + CSS inline, CTA bulletproof Outlook,
// preheader cache, dark mode, responsive), branding VerifierMonDevis (bleu).
//
// Module PUR (aucun import) : importable depuis les edge functions Deno.
// Substitution des variables {{...}} via renderVmdEmail().
//
// Sequence onboarding nouveaux comptes VMD (cf. brief 2026-06-24) :
//   E0 welcome (immediat) · E1 negociation (J+1) · E2 comparer (J+3)
//   E3 pont GMC + offre (J+5) · E4 aides (J+8) · E5 Pass Serenite (J+12)
//   E6 derniere invitation GMC (J+18)
// ============================================================

const LOGO_ICON_URL = "https://www.verifiermondevis.fr/email/logo-vmd-icon.png";

// Liens cibles (hardcodes par template : statiques cote VMD).
const BASE       = "https://www.verifiermondevis.fr";
const GMC_BASE   = "https://www.gerermonchantier.fr";
const URL_ANALYSE = `${BASE}/nouvelle-analyse`;
const URL_DASHBOARD = `${BASE}/tableau-de-bord`;
const URL_AIDES  = `${BASE}/?aides=1`;
const URL_PASS   = `${BASE}/pass-serenite`;
// Offre -50% 1er mois GMC (meme coupon que les emails GMC, via ?offer=1).
const URL_GMC_OFFER = `${GMC_BASE}/gmc-abonnement?plan=essentiel&interval=month&offer=1`;
const URL_GMC_BETA  = `${GMC_BASE}/beta`;

// ─── Variables disponibles ────────────────────────────────────────────────────
export interface VmdEmailVars {
  prenom?: string;
  lien_desinscription?: string;
  lien_mentions?: string;
}

interface EmailDef {
  subject: string;
  preheader: string;
  showUnsubscribe?: boolean;
}

// ─── Definitions (objet + preheader) ──────────────────────────────────────────
export const VMD_EMAIL_DEFS = {
  vmd_welcome:        { subject: "Bienvenue 👋 votre devis mérite un avis d'expert", preheader: "Verdict, surcoût en euros, entreprise vérifiée : votre analyse vous attend." },
  vmd_negociate:      { subject: "Avez-vous renégocié votre devis ?", preheader: "Un récap prêt à copier-coller pour discuter le prix avec votre artisan." },
  vmd_compare:        { subject: "La règle d'or : ne signez jamais le premier devis", preheader: "3 devis minimum. On vous aide à choisir le bon, pas le moins cher." },
  vmd_chantier:       { subject: "Le devis vérifié. Et le chantier ?", preheader: "Vos analyses pilotent la suite : planning, artisans, budget. 1 mois offert." },
  vmd_aides:          { subject: "L'argent que l'État peut payer à votre place", preheader: "MaPrimeRénov', CEE, Éco-PTZ : estimez vos droits en 1 minute." },
  vmd_pass:           { subject: "Ne comptez plus vos analyses", preheader: "Analyses illimitées + rapport PDF partageable, 4,99 € par mois." },
  vmd_chantier_final: { subject: "Votre chantier vous attend", preheader: "Vérifier le devis, c'est l'étape 1. On vous offre la suite." },
} satisfies Record<string, EmailDef>;

export type VmdEmailId = keyof typeof VMD_EMAIL_DEFS;
export const VMD_EMAIL_IDS = Object.keys(VMD_EMAIL_DEFS) as VmdEmailId[];

// ─── Helpers HTML (email-safe) ────────────────────────────────────────────────
function p(t: string): string {
  return `<p style="margin:0 0 18px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;color:#4B5563;line-height:1.78;">${t}</p>`;
}
function h1(t: string): string {
  return `<h1 style="margin:14px 0 20px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;color:#0E1730;line-height:1.3;letter-spacing:-0.02em;">${t}</h1>`;
}
function greeting(): string {
  return `<p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;color:#4B5563;line-height:1.78;">Bonjour <strong style="color:#0E1730;">{{prenom}}</strong>,</p>`;
}
function cta(text: string, href: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;">` +
    `<tr><td align="center">` +
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="22%" stroke="f" fillcolor="#2563EB"><w:anchorlock/><center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:17px;font-weight:700;">${text}</center></v:roundrect><![endif]-->` +
    `<!--[if !mso]><!-->` +
    `<a href="${href}" style="display:inline-block;background:#2563EB;color:#FFFFFF;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;text-decoration:none;padding:15px 40px;border-radius:12px;line-height:1.2;mso-hide:all;">${text}</a>` +
    `<!--<![endif]-->` +
    `</td></tr></table>`
  );
}
function features(title: string, items: [string, string][], bg?: string): string {
  const b = bg || "#EFF4FF";
  const rows = items.map((pair) => (
    `<tr><td style="padding:5px 0;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="width:24px;vertical-align:top;padding-top:2px;">` +
    `<span style="display:inline-block;width:18px;height:18px;background:#1FB664;border-radius:50%;text-align:center;line-height:18px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#FFFFFF;">${pair[0]}</span>` +
    `</td>` +
    `<td style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.65;padding-left:5px;">${pair[1]}</td>` +
    `</tr></table></td></tr>`
  )).join("");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 22px;background:${b};border-radius:12px;overflow:hidden;">` +
    `<tr><td style="padding:18px 22px;">` +
    `<p style="margin:0 0 13px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#1B3FA1;text-transform:uppercase;letter-spacing:0.09em;">${title}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>` +
    `</td></tr></table>`
  );
}
function pricing(name: string, price: string, unit: string, desc: string, highlight?: boolean): string {
  const bg = highlight ? "#EFF4FF" : "#F9FAFB";
  const border = highlight ? "2px solid #2563EB" : "1px solid #E5E7EB";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0;background:${bg};border-radius:10px;border:${border};">` +
    `<tr><td style="padding:14px 18px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td><p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#0E1730;">${name}</p>` +
    `<p style="margin:3px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;">${desc}</p></td>` +
    `<td align="right" style="white-space:nowrap;vertical-align:top;">` +
    `<p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#2563EB;line-height:1;">${price}</p>` +
    `<p style="margin:3px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;color:#9CA3AF;">${unit}</p>` +
    `</td></tr></table></td></tr></table>`
  );
}
function infoBox(content: string, borderColor?: string, bg?: string): string {
  const bc = borderColor || "#F59E0B";
  const b = bg || "#FEF3C7";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 22px;background:${b};border-radius:12px;border-left:4px solid ${bc};">` +
    `<tr><td style="padding:16px 20px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.73;">${content}</td></tr></table>`
  );
}

// Bloc offre GMC : 1 mois offert + -50% sur le 1er mois (perk utilisateur VMD).
function gmcOfferBlock(): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 22px;background:#EFF4FF;border-radius:12px;border:2px solid #2563EB;">` +
    `<tr><td style="padding:22px 24px;">` +
    `<p style="margin:0 0 6px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#1B3FA1;text-transform:uppercase;letter-spacing:0.09em;">Offre utilisateurs VerifierMonDevis</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td><p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#0E1730;">1 mois offert, puis -50 %</p>` +
    `<p style="margin:4px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;">Essai gratuit sans carte bancaire, puis 6 € le 1er mois</p></td>` +
    `<td align="right" style="white-space:nowrap;vertical-align:top;">` +
    `<p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#9CA3AF;text-decoration:line-through;line-height:1;">12 €</p>` +
    `<p style="margin:2px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;color:#1FB664;line-height:1;">6 €</p>` +
    `<p style="margin:2px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;color:#9CA3AF;">1er mois, puis 12 €/mois</p>` +
    `</td></tr></table>` +
    `</td></tr></table>`
  );
}

// ─── Corps des emails ─────────────────────────────────────────────────────────
const BODIES: Record<VmdEmailId, () => string> = {
  // E0 — Bienvenue (immediat, envoye par vmd-on-signup)
  vmd_welcome: () =>
    greeting() +
    h1("Bienvenue sur VerifierMonDevis.") +
    p("Vous avez un devis de travaux entre les mains, et vous vous demandez s'il est honnête. C'est exactement pour ça qu'on existe : un avis d'expert, indépendant, en 2 minutes.") +
    p("On a déjà analysé <strong style=\"color:#0E1730;\">plus de 2 500 devis</strong>, et chaque nouvelle analyse enrichit notre base de prix : plus elle grandit, plus l'estimation est juste. Vous n'êtes pas seul face à votre artisan.") +
    features("Votre analyse vous donne", [
      ["✓", "<strong>Un verdict clair</strong> 🟢🟡🔴 : signer, négocier ou se méfier"],
      ["✓", "<strong>Le surcoût en euros</strong> : combien vous pouvez renégocier"],
      ["✓", "<strong>Les points à discuter</strong> avant de signer"],
      ["✓", "<strong>L'entreprise vérifiée</strong> : SIRET, santé financière, RGE, avis Google"],
    ]) +
    p("C'est gratuit, jusqu'à 5 analyses. Lancez la première :") +
    cta("Analyser mon devis", URL_ANALYSE),

  // E1 — Négociation (J+1)
  vmd_negociate: () =>
    greeting() +
    h1("Votre devis vérifié, et maintenant ?") +
    p("Une fois votre devis analysé, on vous prépare un <strong style=\"color:#0E1730;\">récap prêt à copier-coller</strong> : le verdict, le montant à renégocier et les points précis à discuter. Il suffit de cliquer sur « Copier le message pour négocier » et de l'envoyer à votre artisan, par mail ou WhatsApp.") +
    infoBox("💡 Un artisan ajuste bien plus souvent son prix face à un client qui sait précisément ce qui cloche dans le devis. C'est tout l'intérêt d'arriver avec des arguments chiffrés.") +
    p("Vous n'avez pas encore lancé d'analyse ? C'est le moment, et c'est gratuit.") +
    cta("Revoir mon analyse", URL_DASHBOARD),

  // E2 — Comparer (J+3)
  vmd_compare: () =>
    greeting() +
    h1("Ne signez jamais le premier devis.") +
    p("La règle d'or des travaux : <strong style=\"color:#0E1730;\">3 devis minimum</strong>. Pas pour prendre le moins cher, mais pour choisir le bon : garanties, délais, références, et pas seulement le montant.") +
    p("Faites analyser chacun de vos devis (c'est gratuit jusqu'à 5). Vous verrez d'un coup d'œil lequel tient la route, et lequel gonfle les prix.") +
    features("Pour aller plus loin", [
      ["★", "<strong>Analyses illimitées</strong> : faites vérifier chaque devis reçu, sans compter"],
      ["★", "<strong>Tri par type de travaux</strong> : classez plomberie, électricité, toiture…"],
      ["★", "<strong>Rapport PDF</strong> : partageable avec votre banque ou votre conjoint"],
    ]) +
    p("Ces options font partie du Pass Sérénité (4,99 €/mois). Mais d'abord, profitez de vos analyses gratuites :") +
    cta("Analyser un autre devis", URL_ANALYSE),

  // E3 — Pont GMC + offre (J+5)
  vmd_chantier: () =>
    greeting() +
    h1("Vérifier le devis, c'est l'étape 1 sur 5.") +
    p("Un devis honnête, c'est bien. Mais un chantier, c'est ensuite coordonner 5 à 10 artisans, tenir le budget (7 chantiers sur 10 dérapent en coût et en délai), relancer, et ne rien oublier. Sans outil, ça devient vite ingérable.") +
    p("<strong style=\"color:#0E1730;\">GérerMonChantier</strong> pilote tout pour vous : planning des lots, messagerie WhatsApp unifiée avec vos artisans, trésorerie, rappels d'échéances. L'IA fait le suivi, vous gardez la main.") +
    features("Et le mieux", [
      ["✓", "<strong>Vos analyses VerifierMonDevis s'importent direct</strong> : artisan, montant, score, tout est déjà là"],
      ["✓", "<strong>Même compte</strong> : rien à recréer"],
      ["✓", "<strong>Vos données hébergées en France</strong>"],
    ]) +
    p("Et en tant qu'utilisateur VerifierMonDevis, on vous réserve une offre :") +
    gmcOfferBlock() +
    cta("Activer mon accès GérerMonChantier", URL_GMC_OFFER),

  // E4 — Aides (J+8)
  vmd_aides: () =>
    greeting() +
    h1("L'argent que l'État peut payer à votre place.") +
    p("Avant de signer votre devis, une question simple : avez-vous vérifié vos aides ? <strong style=\"color:#0E1730;\">6 ménages éligibles sur 10 ne demandent jamais MaPrimeRénov'</strong>, par méconnaissance ou parce que c'est trop compliqué.") +
    p("Notre simulateur calcule vos droits à <strong style=\"color:#0E1730;\">MaPrimeRénov', CEE et Éco-PTZ cumulés</strong> en 1 minute, selon votre profil. De quoi faire baisser la facture avant même de négocier.") +
    infoBox("Avec GérerMonChantier, ces aides s'importent directement dans votre plan de financement : vous savez exactement combien il vous reste à sortir de votre poche.", "#1FB664", "#E5F8EE") +
    cta("Calculer mes aides", URL_AIDES),

  // E5 — Pass Sérénité (J+12, a >=2 analyses, pas premium)
  vmd_pass: () =>
    greeting() +
    h1("Ne comptez plus vos analyses.") +
    p("Vous avez pris le réflexe de vérifier vos devis : bonne idée. Le Pass Sérénité vous enlève toutes les limites.") +
    features("Ce que débloque le Pass", [
      ["✓", "<strong>Analyses illimitées</strong> — faites vérifier chaque devis, sans compter"],
      ["✓", "<strong>Rapport PDF partageable</strong> — pour votre banque, votre conjoint, votre courtier"],
      ["✓", "<strong>Tri par type de travaux</strong> — classez et comparez vos devis par poste"],
    ]) +
    pricing("Pass Sérénité", "4,99 €", "/ mois", "Sans engagement, annulable en 1 clic", true) +
    p("Le cœur de l'analyse (verdict, vérification entreprise, prix marché) reste gratuit. Le Pass, c'est pour ceux qui ne veulent plus jamais signer à l'aveugle.") +
    cta("Passer au Pass Sérénité", URL_PASS),

  // E6 — Dernière invitation GMC (J+18)
  vmd_chantier_final: () =>
    greeting() +
    h1("Votre chantier vous attend.") +
    p("Vous avez vérifié vos devis : vous savez désormais ce qu'ils valent vraiment. La dernière pièce, c'est de piloter le chantier sans y laisser vos soirées.") +
    p("<strong style=\"color:#0E1730;\">GérerMonChantier</strong> centralise tout : planning, artisans, budget, alertes. Vos analyses VerifierMonDevis deviennent le point de départ, et l'IA fait le suivi à votre place.") +
    p("L'essai est offert, sans carte bancaire. Si ce n'est pas le moment, gardez ce mail sous le coude :") +
    cta("Découvrir GérerMonChantier", URL_GMC_BETA),
};

// ─── Layout maitre (header lockup + carte + footer + dark mode + responsive) ──
function buildEmailContent(id: VmdEmailId): string {
  const def = VMD_EMAIL_DEFS[id];
  const bodyHtml = BODIES[id]();
  const preheader = def.preheader || "";
  const filler = Array(20).fill("&nbsp;&zwnj;").join("");
  const footerLinks = (def as { showUnsubscribe?: boolean }).showUnsubscribe !== false
    ? `<a href="{{lien_desinscription}}" style="color:#9CA3AF;text-decoration:underline;">Se d&eacute;sinscrire</a>&nbsp;&middot;&nbsp;<a href="{{lien_mentions}}" style="color:#9CA3AF;text-decoration:underline;">Mentions l&eacute;gales</a>`
    : `<span style="color:#9CA3AF;">Email transactionnel</span>`;
  return (
    `<!-- Preheader cache -->\n` +
    `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#F5F7FB;">${preheader}${filler}</div>\n` +
    `<table role="presentation" class="email-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F7FB;min-width:320px;">` +
    `<tr><td align="center" style="padding:32px 16px 40px;">` +
    `<table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">` +

    // Header - lockup VMD (icone hebergee + wordmark texte)
    `<tr><td align="center" style="padding:0 0 22px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:middle;padding-right:10px;">` +
    `<img src="${LOGO_ICON_URL}" alt="" width="44" height="44" style="display:block;border:0;border-radius:11px;" />` +
    `</td>` +
    `<td style="vertical-align:middle;text-align:left;">` +
    `<div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#0E1730;line-height:1.1;letter-spacing:-0.02em;">Vérifier<span style="color:#2563EB;">Mon</span>Devis</div>` +
    `<div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:9px;font-weight:700;color:#9CA3AF;letter-spacing:0.16em;text-transform:uppercase;margin-top:2px;">L'avis d'expert sur vos devis</div>` +
    `</td>` +
    `</tr></table>` +
    `</td></tr>` +

    // Carte
    `<tr><td class="email-card" style="background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(14,23,48,0.07);">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td class="email-card-padding" style="padding:44px 48px 36px;">` +
    bodyHtml +
    `</td></tr></table></td></tr>` +

    // Footer
    `<tr><td style="padding:28px 24px;text-align:center;">` +
    `<p style="margin:0 0 10px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#9CA3AF;line-height:1.7;"><strong style="color:#6B7280;">VerifierMonDevis</strong> &mdash; l'analyse de devis qui vous protège</p>` +
    `<p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">${footerLinks}</p>` +
    `</td></tr>` +

    `</table></td></tr></table>`
  );
}

function buildEmailDocument(id: VmdEmailId): string {
  const def = VMD_EMAIL_DEFS[id];
  const emailBody = buildEmailContent(id);
  return (
    `<!DOCTYPE html>\n` +
    `<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n` +
    `<head>\n` +
    `  <meta charset="utf-8">\n` +
    `  <meta http-equiv="X-UA-Compatible" content="IE=edge">\n` +
    `  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n` +
    `  <meta name="x-apple-disable-message-reformatting">\n` +
    `  <title>${def.subject}</title>\n` +
    `  <!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->\n` +
    `  <style type="text/css">\n` +
    `    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');\n` +
    `    * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }\n` +
    `    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }\n` +
    `    table { border-collapse: collapse !important; }\n` +
    `    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }\n` +
    `    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }\n` +
    `    @media screen and (max-width: 620px) {\n` +
    `      .email-container { width: 100% !important; }\n` +
    `      .email-card-padding { padding: 28px 24px 24px !important; }\n` +
    `    }\n` +
    `    @media (prefers-color-scheme: dark) {\n` +
    `      .email-bg { background-color: #0d1117 !important; }\n` +
    `      .email-card { background-color: #161b22 !important; }\n` +
    `    }\n` +
    `  </style>\n` +
    `</head>\n` +
    `<body style="margin:0;padding:0;background-color:#F5F7FB;-webkit-font-smoothing:antialiased;">\n` +
    emailBody +
    `\n</body>\n</html>`
  );
}

// ─── Substitution + rendu ─────────────────────────────────────────────────────
function escText(s: unknown): string {
  return String(s ?? "")
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");
}
function escAttr(s: unknown): string {
  return String(s ?? "")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");
}

/**
 * Rend un email VMD pret a envoyer.
 * Retourne { subject, preheader, html } avec les variables {{...}} substituees.
 */
export function renderVmdEmail(
  id: VmdEmailId,
  vars: VmdEmailVars = {},
): { subject: string; preheader: string; html: string } {
  const def = VMD_EMAIL_DEFS[id];

  const map: Record<string, string> = {
    prenom: escText(vars.prenom ?? ""),
    lien_desinscription: escAttr(vars.lien_desinscription ?? "mailto:contact@verifiermondevis.fr?subject=Désinscription"),
    lien_mentions: escAttr(vars.lien_mentions ?? "https://www.verifiermondevis.fr/mentions-legales"),
  };

  const sub = (tpl: string): string =>
    tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in map ? map[key] : m));

  let html = sub(buildEmailDocument(id));
  // Salutation sans prenom : "Bonjour <strong></strong>," -> "Bonjour,"
  if (!String(vars.prenom ?? "").trim()) {
    html = html.replace(/Bonjour <strong style="color:#0E1730;"><\/strong>,/g, "Bonjour,");
  }

  return {
    subject: sub(def.subject),
    preheader: sub(def.preheader),
    html,
  };
}
