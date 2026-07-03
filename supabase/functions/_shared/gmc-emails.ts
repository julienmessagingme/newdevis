// ============================================================
// GMC - Templates email (portes depuis le handoff Claude Design "email tunnel").
// 21 templates : un layout maitre email-safe (tables + CSS inline, CTA bulletproof
// Outlook, preheader cache, dark mode, responsive) + un corps par email.
//
// Module PUR (aucun import) : importable depuis les edge functions Deno ET
// executable en Node pour test. Substitution des variables {{...}} via renderGmcEmail().
//
// Note logo : le handoff hebergeait une image unique, mais l'asset copie etait le
// logo VerifierMonDevis (mauvais). Ici le header reproduit le vrai lockup GMC
// (icone maison + grue hebergee en PNG + wordmark texte), donc le sens tient meme
// images bloquees (contrainte du brief).
// ============================================================

const LOGO_ICON_URL = "https://www.gerermonchantier.fr/email/logo-gmc-icon.png";

// ─── Variables disponibles ────────────────────────────────────────────────────
export interface GmcEmailVars {
  prenom?: string;
  nom_chantier?: string;
  jours_restants?: string | number;
  date_fin_essai?: string;
  date_renouvellement?: string;
  montant?: string;
  lien_cta?: string;
  lien_desinscription?: string;
  lien_mentions?: string;
  lien_avis?: string;
  /** Si fourni, le lien de desinscription pointe vers /desinscription?u=<user_id>
   * (1 clic = opt-out enregistre en base RGPD). Sinon fallback mailto. */
  user_id?: string;
}

interface EmailDef {
  subject: string;
  preheader: string;
  showUnsubscribe?: boolean;
}

// ─── Definitions (objet + preheader + desinscription) ─────────────────────────
export const GMC_EMAIL_DEFS = {
  gmc_welcome:        { subject: "Bienvenue sur GérerMonChantier, votre mois offert démarre", preheader: "Votre Pilote IA est prêt à structurer votre chantier." },
  gmc_activate:       { subject: "Votre Pilote attend votre chantier", preheader: "Décrivez votre projet, recevez lots, planning et budget en 60 secondes." },
  gmc_value_features: { subject: "3 choses que votre Pilote fait pour vous", preheader: "Messagerie artisans, suivi budget, planning qui se recalcule tout seul." },
  gmc_trust:          { subject: "Piloter ses travaux sans stress, c'est possible", preheader: "Comment d'autres gardent le contrôle de leur chantier." },
  gmc_midtrial:       { subject: "Vous êtes à mi-parcours de votre essai", preheader: "Voici votre chantier en chiffres, et ce qu'il reste à explorer." },
  gmc_trial_j7:       { subject: "Plus que 7 jours d'essai gratuit", preheader: "Gardez votre chantier actif, à partir de 12 € par mois." },
  gmc_trial_j3:       { subject: "-50% sur votre 1er mois (offre qui expire dans 3 jours)", preheader: "6 € au lieu de 12 € pour garder votre chantier, sans engagement." },
  gmc_trial_j1:       { subject: "Dernier jour pour -50% sur votre 1er mois", preheader: "Demain, votre chantier passe en lecture seule. 6 € au lieu de 12 €." },
  gmc_trial_ended:    { subject: "Votre essai est terminé, reprenez à -50% sur le 1er mois", preheader: "Vos données sont conservées. 6 € au lieu de 12 € pour réactiver." },
  gmc_winback_1:      { subject: "Votre chantier vous attend", preheader: "Tout est encore là, reprenez où vous en étiez." },
  gmc_winback_2:      { subject: "On garde votre chantier encore un peu", preheader: "Dernière occasion de reprendre votre suivi." },
  gmc_winback_offer:  { subject: "On vous remet -50% sur votre 1er mois", preheader: "Votre chantier est toujours là. 6 € au lieu de 12 €." },
  gmc_upsell_multi:   { subject: "Pilotez tous vos chantiers au même endroit", preheader: "L'offre Multi débloque les chantiers illimités." },
  gmc_multi_nudge:    { subject: "Vous gérez plusieurs chantiers ? On a ce qu'il faut", preheader: "Vue agrégée, bascule en un clic, un seul cockpit." },
  gmc_reengage:       { subject: "Votre chantier n'attend que vous", preheader: "Quelques minutes suffisent pour avancer." },
  gmc_paid_welcome:   { subject: "C'est officiel, votre abonnement GMC est actif", preheader: "Merci, voici ce que vous débloquez." },
  gmc_paid_onboard:   { subject: "Débloquez tout le potentiel de votre Pilote", preheader: "Multi-chantiers, journal IA quotidien, intégrations." },
  gmc_paid_checkin:   { subject: "Votre chantier, deux semaines après", preheader: "Un point d'avancement et quelques astuces." },
  gmc_renewal_notice: { subject: "Votre abonnement se renouvelle le {{date_renouvellement}}", preheader: "{{montant}}, rien à faire, tout est géré." },
  gmc_dunning:        { subject: "Action requise : votre paiement n'a pas abouti", preheader: "Mettez à jour votre moyen de paiement pour garder l'accès.", showUnsubscribe: false },
  gmc_goodbye:        { subject: "Votre chantier reste accessible, dites-nous tout", preheader: "On aimerait comprendre, et vous laisser la porte ouverte.", showUnsubscribe: false },
} satisfies Record<string, EmailDef>;

export type GmcEmailId = keyof typeof GMC_EMAIL_DEFS;
export const GMC_EMAIL_IDS = Object.keys(GMC_EMAIL_DEFS) as GmcEmailId[];

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
function cta(text: string, href?: string): string {
  const h = href || "{{lien_cta}}";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;">` +
    `<tr><td align="center">` +
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="22%" stroke="f" fillcolor="#F58A06"><w:anchorlock/><center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:17px;font-weight:700;">${text}</center></v:roundrect><![endif]-->` +
    `<!--[if !mso]><!-->` +
    `<a href="${h}" style="display:inline-block;background:#F58A06;color:#FFFFFF;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;text-decoration:none;padding:15px 40px;border-radius:12px;line-height:1.2;mso-hide:all;">${text}</a>` +
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
function pricing(name: string, price: string, desc: string, highlight?: boolean): string {
  const bg = highlight ? "#EFF4FF" : "#F9FAFB";
  const border = highlight ? "2px solid #1B3FA1" : "1px solid #E5E7EB";
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0;background:${bg};border-radius:10px;border:${border};">` +
    `<tr><td style="padding:14px 18px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td><p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#0E1730;">${name}</p>` +
    `<p style="margin:3px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;">${desc}</p></td>` +
    `<td align="right" style="white-space:nowrap;vertical-align:top;">` +
    `<p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#1B3FA1;line-height:1;">${price}</p>` +
    `<p style="margin:3px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;color:#9CA3AF;">/ mois</p>` +
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
function twoCtas(text1: string, text2: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;"><tr>` +
    `<td align="right" style="padding-right:8px;">` +
    `<!--[if !mso]><!-->` +
    `<a href="{{lien_cta}}" style="display:inline-block;background:#F58A06;color:#FFFFFF;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:10px;line-height:1.2;mso-hide:all;">${text1}</a>` +
    `<!--<![endif]-->` +
    `</td><td align="left" style="padding-left:8px;">` +
    `<!--[if !mso]><!-->` +
    `<a href="{{lien_avis}}" style="display:inline-block;background:#FFFFFF;color:#4B5563;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;border:1px solid #D1D5DB;line-height:1.2;mso-hide:all;">${text2}</a>` +
    `<!--<![endif]-->` +
    `</td></tr></table>`
  );
}

// Bloc "offre -50%" (12 EUR barre -> 6 EUR), partage par J-3 / J-1 / trial_ended / winback_offer.
function offerBlock(eyebrow: string, marginBottom: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 ${marginBottom};background:#EFF4FF;border-radius:12px;border:2px solid #1B3FA1;">` +
    `<tr><td style="padding:22px 24px;">` +
    `<p style="margin:0 0 6px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#1B3FA1;text-transform:uppercase;letter-spacing:0.09em;">${eyebrow}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td><p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#0E1730;">Essentiel — 1er mois</p>` +
    `<p style="margin:4px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;">1 chantier · Pilote IA · Planning et budget</p></td>` +
    `<td align="right" style="white-space:nowrap;vertical-align:top;">` +
    `<p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#9CA3AF;text-decoration:line-through;line-height:1;">12 €</p>` +
    `<p style="margin:2px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;color:#1FB664;line-height:1;">6 €</p>` +
    `<p style="margin:2px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:11px;color:#9CA3AF;">1er mois, puis 12 €/mois</p>` +
    `</td></tr></table>` +
    `</td></tr></table>`
  );
}

// ─── Corps des emails ─────────────────────────────────────────────────────────
const BODIES: Record<GmcEmailId, () => string> = {
  gmc_welcome: () =>
    greeting() +
    h1("Bienvenue sur GérerMonChantier.") +
    p("Votre mois d'essai gratuit démarre maintenant. Pas de carte bancaire, pas d'engagement. Votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> est déjà créé.") +
    p("Le Pilote IA structure votre projet en quelques minutes : lots, planning, budget et suivi des artisans, tout au même endroit.") +
    features("Votre Pilote s'occupe de", [
      ["✓", "<strong>Lots et planning</strong> — votre chantier structuré en quelques minutes"],
      ["✓", "<strong>Budget et trésorerie</strong> — chaque dépense suivie en temps réel"],
      ["✓", "<strong>Messagerie artisans</strong> — WhatsApp et email depuis un seul endroit"],
    ]) +
    p("Commencez par décrire votre projet : le Pilote s'occupe du reste.") +
    cta("Accéder à mon chantier"),

  gmc_activate: () =>
    greeting() +
    h1("Votre Pilote attend votre chantier.") +
    p("Vous êtes à 60 secondes d'avoir un plan de chantier complet. Décrivez votre projet en quelques mots — le Pilote génère aussitôt vos lots, votre planning et une estimation de budget.") +
    p("Pas besoin d'être expert. Une phrase suffit : <em style=\"color:#374151;\">« Rénovation complète d'une salle de bain 8 m², remplacement plomberie et carrelage. »</em>") +
    cta("Décrire mon chantier"),

  gmc_value_features: () =>
    h1("3 choses que votre Pilote fait pour vous.") +
    p("Pendant un chantier, il se passe beaucoup de choses en même temps. Voici ce que GérerMonChantier gère à votre place :") +
    features("Fonctions clés du Pilote", [
      ["1", "<strong>Messagerie artisans / intervenants</strong> — créez vos groupes WhatsApp automatiquement et répondez directement à tous, ou laissez votre agent IA le faire pour vous."],
      ["2", "<strong>Suivi budget</strong> — chaque paiement s'enregistre, les écarts se voient immédiatement. Vous savez toujours où vous en êtes."],
      ["3", "<strong>Planning auto</strong> — modifiez un lot, le planning se recalcule. Anticipez les retards avant qu'ils arrivent."],
    ]) +
    p("Tout ça depuis un seul écran. Votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> vous attend.") +
    cta("Explorer mon cockpit"),

  gmc_trust: () =>
    greeting() +
    h1("Piloter ses travaux sans stress, c'est possible.") +
    p("Beaucoup de propriétaires démarrent un chantier confiants — et finissent débordés. Pas par manque de bonne volonté, mais parce qu'il n'existe pas d'endroit unique pour tout suivre.") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 22px;background:#F9FAFB;border-radius:12px;border-left:4px solid #1B3FA1;"><tr><td style="padding:20px 22px;"><p style="margin:0 0 12px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:15px;color:#374151;line-height:1.75;font-style:italic;">« J'avais trois artisans et un planning qui n'arrêtait pas de changer. Avec GérerMonChantier, j'ai centralisé tout en une heure. Le Pilote m'a évité deux semaines de retard que je n'aurais jamais vues venir. »</p><p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#6B7280;font-weight:600;">— Marie T., rénovation 85 m², Paris 11e</p></td></tr></table>` +
    p("GérerMonChantier vous évite les trois problèmes les plus fréquents : les retards invisibles, les dépassements de budget qui surprennent, les artisans qui restent sans réponse.") +
    cta("Reprendre mon chantier"),

  gmc_midtrial: () =>
    greeting() +
    h1("Vous êtes à mi-parcours de votre essai.") +
    p("Deux semaines depuis votre inscription — votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> prend forme. Voici ce qui a été mis en place :") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 22px;"><tr>` +
    `<td width="33%" style="padding-right:5px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFF4FF;border-radius:10px;"><tr><td style="padding:14px 10px;text-align:center;"><p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;color:#1B3FA1;line-height:1;">—</p><p style="margin:6px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:9px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:0.09em;">Lots créés</p></td></tr></table></td>` +
    `<td width="34%" style="padding:0 2.5px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFF4FF;border-radius:10px;"><tr><td style="padding:14px 10px;text-align:center;"><p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#1B3FA1;line-height:1;">— €</p><p style="margin:6px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:9px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:0.09em;">Budget estimé</p></td></tr></table></td>` +
    `<td width="33%" style="padding-left:5px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EFF4FF;border-radius:10px;"><tr><td style="padding:14px 10px;text-align:center;"><p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;color:#1B3FA1;line-height:1;">—</p><p style="margin:6px 0 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:9px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:0.09em;">Artisans</p></td></tr></table></td>` +
    `</tr></table>` +
    p("Il vous reste deux semaines pour explorer les fonctions non encore activées : le <strong style=\"color:#0E1730;\">journal IA quotidien</strong> et la <strong style=\"color:#0E1730;\">messagerie WhatsApp intégrée</strong>.") +
    cta("Compléter mon chantier"),

  gmc_trial_j7: () =>
    greeting() +
    h1("Plus que {{jours_restants}} jours d'essai gratuit.") +
    p("Votre essai se termine le <strong style=\"color:#0E1730;\">{{date_fin_essai}}</strong>. Pour continuer à piloter votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong>, choisissez votre offre :") +
    pricing("Essentiel", "12 €", "1 chantier actif · Pilote IA · Planning et budget", true) +
    pricing("Multi", "25 €", "Chantiers illimités · Journal IA quotidien · Intégrations") +
    p("Sans engagement. Résiliable en 1 clic depuis Réglages → Abonnement.") +
    cta("Choisir mon offre"),

  gmc_trial_j3: () =>
    greeting() +
    h1("Offre -50 % — 3 jours pour en profiter.") +
    p("Votre essai se termine dans 3 jours. Pour garder votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> pleinement actif, on vous offre <strong style=\"color:#0E1730;\">−50 % sur votre premier mois</strong>.") +
    offerBlock("Offre de bienvenue", "22px") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr>` +
    `<td style="padding:4px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.75;">✓  <strong style="color:#0E1730;">Sans engagement</strong> — résiliable en 1 clic.</td></tr>` +
    `<tr><td style="padding:4px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.75;">✓  <strong style="color:#0E1730;">Aucune perte de données</strong> — votre chantier reste intact.</td></tr>` +
    `<tr><td style="padding:4px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.75;">✓  <strong style="color:#0E1730;">Sans l'offre</strong>, votre chantier passe en lecture seule à la fin de l'essai.</td></tr>` +
    `</table>` +
    cta("Profiter de −50 %"),

  gmc_trial_j1: () =>
    greeting() +
    h1("Dernier jour pour profiter de −50 %.") +
    p("C'est aujourd'hui le dernier jour pour activer l'offre. Demain, votre essai expire et votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> passe en <strong style=\"color:#0E1730;\">lecture seule</strong>.") +
    offerBlock("Offre de bienvenue — expire ce soir", "10px") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 22px;background:#FEF3C7;border-radius:12px;border-left:4px solid #F59E0B;"><tr><td style="padding:14px 18px;"><p style="margin:0 0 10px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.08em;">À partir de demain sans abonnement</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:2px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#78350F;line-height:1.65;">✓ Vos données et votre chantier sont conservés</td></tr><tr><td style="padding:2px 0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#78350F;line-height:1.65;">✗ Modifications et messagerie artisans suspendues</td></tr></table></td></tr></table>` +
    p("Sans engagement. Résiliable en 1 clic depuis Réglages → Abonnement.") +
    cta("Profiter de −50 %"),

  gmc_trial_ended: () =>
    greeting() +
    h1("Votre essai est terminé.") +
    p("Votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> est en lecture seule. Toutes vos données sont conservées : lots, planning, budget, contacts artisans. Rien n'a été supprimé.") +
    p("Pour reprendre exactement où vous en étiez, on vous offre <strong style=\"color:#0E1730;\">−50 % sur votre premier mois</strong>.") +
    offerBlock("Offre de bienvenue", "22px") +
    p("Sans engagement. Résiliable en 1 clic. Réactivation immédiate.") +
    cta("Réactiver à −50 %"),

  gmc_winback_1: () =>
    greeting() +
    h1("Votre chantier vous attend.") +
    p("Votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> est toujours là — avec tous vos lots, votre planning et vos contacts artisans. Rien n'a été effacé.") +
    p("Reprenez là où vous en étiez, en 1 clic.") +
    cta("Réactiver"),

  gmc_winback_2: () =>
    greeting() +
    h1("On garde votre chantier encore un peu.") +
    p("C'est notre dernier message. Votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> reste accessible encore quelques jours.") +
    p("Si GérerMonChantier ne vous a pas convaincu, votre retour nous aide à progresser. Deux questions, 30 secondes.") +
    twoCtas("Réactiver", "Donner mon avis"),

  gmc_winback_offer: () =>
    greeting() +
    h1("On vous remet −50 % sur votre 1er mois.") +
    p("Il y a environ un mois, votre essai GérerMonChantier s'est terminé. Votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> est toujours là, en lecture seule, avec toutes vos données intactes.") +
    p("Si le moment est venu de reprendre, voici notre dernière offre :") +
    offerBlock("Dernière offre — 1er mois offert à moitié prix", "22px") +
    p("Sans engagement, résiliable en 1 clic. Réactivation immédiate — vous reprenez exactement où vous en étiez.") +
    cta("Reprendre à −50 %"),

  gmc_upsell_multi: () =>
    greeting() +
    h1("Pilotez tous vos chantiers au même endroit.") +
    p("Votre essai couvre 1 chantier actif. Si vous gérez plusieurs projets en parallèle — rénovation, extension, second logement — l'offre Multi est faite pour vous.") +
    features("Ce que vous débloquez avec Multi", [
      ["✓", "<strong>Chantiers illimités</strong> — passez d'un projet à l'autre en un clic"],
      ["✓", "<strong>Journal IA quotidien</strong> — un résumé automatique de l'avancement chaque matin"],
      ["✓", "<strong>Vue agrégée</strong> — budgets et plannings de tous vos chantiers sur un seul écran"],
      ["✓", "<strong>Intégrations</strong> — WhatsApp, email, Calendly depuis votre cockpit"],
    ]) +
    pricing("Multi", "25 €", "Chantiers illimités · Journal IA · Intégrations", true) +
    cta("Passer à Multi"),

  gmc_multi_nudge: () =>
    greeting() +
    h1("Plusieurs chantiers ? On a ce qu'il faut.") +
    p("Vous avez signalé gérer plusieurs projets. Avec l'offre Multi, vous avez un seul cockpit pour tout piloter : vue agrégée des budgets, bascule en un clic entre les chantiers.") +
    features("Multi en pratique", [
      ["✓", "Rénovation cuisine + extension véranda : deux lots distincts, un seul budget global"],
      ["✓", "Votre maître d'œuvre voit le même planning que vous, en temps réel"],
      ["✓", "Chaque artisan reçoit les messages du bon chantier, sans confusion"],
    ]) +
    cta("Découvrir l'offre Multi"),

  gmc_reengage: () =>
    greeting() +
    h1("Votre chantier n'attend que vous.") +
    p("Votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> est actif. Cela fait quelques jours que vous n'y êtes pas passé.") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 22px;background:#EFF4FF;border-radius:12px;"><tr><td style="padding:16px 22px;"><p style="margin:0 0 6px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;color:#1B3FA1;text-transform:uppercase;letter-spacing:0.09em;">Astuce rapide</p><p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#374151;line-height:1.7;">Demandez au Pilote un <strong style="color:#0E1730;">point d'avancement</strong> : il analyse vos lots et vous dit où en est votre chantier en moins d'une minute.</p></td></tr></table>` +
    cta("Reprendre mon chantier"),

  gmc_paid_welcome: () =>
    greeting() +
    h1("C'est officiel : votre abonnement est actif.") +
    p("Merci pour votre confiance. Votre accès à GérerMonChantier est désormais complet.") +
    features("Ce que vous avez débloqué", [
      ["✓", "<strong>Pilote IA illimité</strong> — lots, planning, budget générés à la demande"],
      ["✓", "<strong>Messagerie artisans</strong> — WhatsApp et email depuis votre cockpit"],
      ["✓", "<strong>Suivi budget en temps réel</strong> — chaque paiement, chaque écart visible"],
      ["✓", "<strong>Documents centralisés</strong> — devis, factures, photos au même endroit"],
    ], "#E5F8EE") +
    p("Pour gérer ou résilier à tout moment : <strong style=\"color:#0E1730;\">Réglages → Abonnement</strong>.") +
    cta("Ouvrir mon cockpit"),

  gmc_paid_onboard: () =>
    greeting() +
    h1("Débloquez tout le potentiel de votre Pilote.") +
    p("Deux jours après votre abonnement, voici 3 fonctions que nos abonnés activent en premier :") +
    features("À activer maintenant", [
      ["1", "<strong>Journal IA quotidien</strong> — chaque matin, un résumé de l'état de votre chantier. Activez dans Réglages → Notifications."],
      ["2", "<strong>Messagerie WhatsApp intégrée</strong> — connectez votre numéro et répondez à vos artisans sans quitter l'application."],
      ["3", "<strong>Partage artisan</strong> — générez un lien de suivi que votre artisan peut consulter : il voit son lot et son planning."],
    ]) +
    cta("Explorer"),

  gmc_paid_checkin: () =>
    greeting() +
    h1("Votre chantier, deux semaines après.") +
    p("Deux semaines de suivi actif — c'est souvent là que le Pilote prend tout son sens. Comment ça se passe pour <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> ?") +
    features("Deux conseils pour aller plus loin", [
      ["→", "<strong>Prenez une photo sur le chantier</strong> et envoyez-la au Pilote. Il analyse l'avancement et met à jour vos lots."],
      ["→", "<strong>Activez les alertes de dépassement</strong> dans Réglages → Budget. Le Pilote prévient avant que ça arrive."],
    ]) +
    p("Une question ? <a href=\"mailto:contact@gerermonchantier.fr\" style=\"color:#1B3FA1;text-decoration:none;font-weight:600;\">contact@gerermonchantier.fr</a>") +
    cta("Voir mon avancement"),

  gmc_renewal_notice: () =>
    greeting() +
    h1("Votre abonnement se renouvelle bientôt.") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 22px;background:#EFF4FF;border-radius:12px;border:1px solid #C7D7F9;"><tr><td style="padding:16px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#374151;padding:6px 0;"><strong style="color:#0E1730;">Date de renouvellement</strong></td><td align="right" style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1B3FA1;padding:6px 0;">{{date_renouvellement}}</td></tr><tr><td style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;color:#374151;padding:6px 0;border-top:1px solid #DBE6FF;"><strong style="color:#0E1730;">Montant prélevé</strong></td><td align="right" style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#1B3FA1;padding:6px 0;border-top:1px solid #DBE6FF;">{{montant}}</td></tr></table></td></tr></table>` +
    p("Rien à faire — le prélèvement est automatique. Pour modifier ou résilier avant cette date, rendez-vous dans <strong style=\"color:#0E1730;\">Réglages → Abonnement</strong>.") +
    cta("Gérer mon abonnement"),

  gmc_dunning: () =>
    greeting() +
    h1("Votre paiement n'a pas abouti.") +
    infoBox("Nous n'avons pas pu débiter votre abonnement GérerMonChantier. Votre accès reste actif pour l'instant — <strong style=\"color:#78350F;\">mais il sera suspendu dans 7 jours</strong> si le paiement n'est pas régularisé.") +
    features("Comment corriger en 2 minutes", [
      ["1", "<strong>Ouvrez Réglages → Paiement</strong> dans votre cockpit"],
      ["2", "<strong>Mettez à jour votre moyen de paiement</strong> (carte bancaire ou SEPA)"],
      ["3", "Le prélèvement est relancé automatiquement — <strong>votre accès est immédiatement restauré</strong>"],
    ]) +
    p("Un problème ? <a href=\"mailto:contact@gerermonchantier.fr\" style=\"color:#1B3FA1;text-decoration:none;font-weight:600;\">contact@gerermonchantier.fr</a>") +
    cta("Mettre à jour mon paiement"),

  gmc_goodbye: () =>
    greeting() +
    h1("Votre abonnement est annulé.") +
    p("Merci pour votre confiance. Votre chantier <strong style=\"color:#0E1730;\">« {{nom_chantier}} »</strong> reste accessible en <strong style=\"color:#0E1730;\">lecture seule pendant 90 jours</strong>. Vos lots, planning, budget et documents sont conservés.") +
    p("Si quelque chose ne vous a pas convaincu, votre retour nous aide à améliorer GérerMonChantier. Deux questions, 30 secondes.") +
    twoCtas("Réactiver", "Donner mon avis"),
};

// ─── Layout maitre (header lockup + carte + footer + dark mode + responsive) ──
function buildEmailContent(id: GmcEmailId): string {
  const def = GMC_EMAIL_DEFS[id];
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

    // Header - lockup GMC (icone hebergee + wordmark texte)
    `<tr><td align="center" style="padding:0 0 22px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:middle;padding-right:10px;">` +
    `<img src="${LOGO_ICON_URL}" alt="" width="44" height="44" style="display:block;border:0;border-radius:11px;" />` +
    `</td>` +
    `<td style="vertical-align:middle;text-align:left;">` +
    `<div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#0E1730;line-height:1.1;letter-spacing:-0.02em;">Gérer<span style="color:#F58A06;">Mon</span>Chantier</div>` +
    `<div style="font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:9px;font-weight:700;color:#9CA3AF;letter-spacing:0.18em;text-transform:uppercase;margin-top:2px;">Pilote IA de chantier</div>` +
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
    `<p style="margin:0 0 10px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:13px;color:#9CA3AF;line-height:1.7;"><strong style="color:#6B7280;">GérerMonChantier</strong> &mdash; une solution <a href="https://www.verifiermondevis.fr" style="color:#6B7280;text-decoration:none;">VerifierMonDevis.fr</a></p>` +
    `<p style="margin:0;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">${footerLinks}</p>` +
    `</td></tr>` +

    `</table></td></tr></table>`
  );
}

function buildEmailDocument(id: GmcEmailId): string {
  const def = GMC_EMAIL_DEFS[id];
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
 * Rend un email GMC pret a envoyer.
 * Retourne { subject, preheader, html } avec toutes les variables {{...}} substituees.
 * Les valeurs absentes retombent sur des defauts elegants (cf. brief).
 */
export function renderGmcEmail(
  id: GmcEmailId,
  vars: GmcEmailVars = {},
): { subject: string; preheader: string; html: string } {
  const def = GMC_EMAIL_DEFS[id];
  const nomChantier = vars.nom_chantier && String(vars.nom_chantier).trim()
    ? vars.nom_chantier
    : "votre chantier";

  const map: Record<string, string> = {
    prenom: escText(vars.prenom ?? ""),
    nom_chantier: escText(nomChantier),
    jours_restants: escText(vars.jours_restants ?? "quelques"),
    date_fin_essai: escText(vars.date_fin_essai ?? "bientôt"),
    date_renouvellement: escText(vars.date_renouvellement ?? "prochainement"),
    montant: escText(vars.montant ?? "12 €"),
    lien_cta: escAttr(vars.lien_cta ?? "https://www.gerermonchantier.fr/mon-chantier"),
    lien_desinscription: escAttr(vars.lien_desinscription ?? (
      vars.user_id
        ? `https://www.gerermonchantier.fr/desinscription?u=${encodeURIComponent(vars.user_id)}`
        : "mailto:contact@gerermonchantier.fr?subject=Désinscription"
    )),
    lien_mentions: escAttr(vars.lien_mentions ?? "https://www.gerermonchantier.fr/mentions-legales"),
    lien_avis: escAttr(vars.lien_avis ?? "https://www.gerermonchantier.fr/avis"),
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
