/**
 * GET/POST /api/analyse/outcome-click — enregistrement d'issue via l'email J+15.
 *
 * 2026-08-24 (boucle de capture des issues, décision Johan).
 * Lien à UN CLIC depuis l'email « Ce devis, finalement ? » : aucun login requis,
 * la sécurité repose sur un token HMAC-SHA256(analysisId, AGENT_SECRET_KEY)
 * généré par vmd-outcome-scheduler — impossible de forger une issue sans
 * l'email. GET = enregistre le choix + page de remerciement (avec, pour
 * « signé après négociation », un champ optionnel « remise obtenue » qui
 * POSTe sur cette même route).
 */
import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/api/apiHelpers';

export const prerender = false;

const CHOICES = new Set(['signe_tel_quel', 'signe_apres_negociation', 'non_signe', 'hesite']);

/**
 * 🟢 2026-09-24 (décision Johan) — LA QUESTION DE FINANCEMENT, EN SECOND TEMPS.
 *
 * Elle est posée sur la page de remerciement, APRÈS l'enregistrement de
 * l'issue — jamais dans l'e-mail ni à côté d'une autre demande. C'est la règle
 * du 16/09 (« on ne fait pas 2 demandes en même temps ») : la personne a déjà
 * répondu à ce pour quoi on l'a sollicitée, on ne met rien en concurrence.
 *
 * 🔴 CE QUE CE CANAL RAPPORTE, MESURÉ AVANT DE LE CONSTRUIRE — et ça affaiblit
 * la recommandation qui l'a fait naître : **43 relances envoyées en 90 jours,
 * 2 réponses (4,7 %)**. Soit ~0,5 e-mail/jour et ~2 personnes qui atteignent
 * cette page par trimestre. À côté, la modale de fin de lecture est à
 * 1,0-1,5 affichage/jour. Ce n'est donc PAS un levier de volume, et il ne faut
 * pas l'attendre : c'est un canal de QUALITÉ — ceux qui cliquent sont revenus
 * quinze jours plus tard pour nous dire ce qu'ils avaient fait de leur devis,
 * ce sont les plus engagés du corpus.
 *
 * ⚠️ LEURS RÉPONSES NE DÉCIDENT DE RIEN, et c'est pour ça que la colonne
 * `lead_interest.source` existe (migration 20260924100000). Le verdict du 16/12
 * se prend sur `réponses / affichages`, et les affichages ne comptent que la
 * modale : une réponse venue d'ici ferait monter le taux sans dénominateur.
 * `/api/admin/do-interest-kpis` les expose donc sous `reponses_relance`.
 */
const FINANCEMENT_MIN_HT = 3000;

/** ⚠️ Mêmes valeurs ET mêmes libellés que la modale (`FeedbackModal.tsx`) :
 *  deux formulations différentes ne produiraient pas des réponses comparables. */
const REPONSES_FINANCEMENT: { valeur: string; libelle: string }[] = [
  { valeur: 'interesse', libelle: 'Je cherche une solution' },
  { valeur: 'deja_equipe', libelle: "C'est déjà financé" },
  { valeur: 'non', libelle: 'Je paie sans emprunter' },
];
const VALEURS_FINANCEMENT = new Set(REPONSES_FINANCEMENT.map((r) => r.valeur));

const CHOICE_LABEL: Record<string, string> = {
  signe_tel_quel: 'Signé tel quel',
  signe_apres_negociation: 'Signé après négociation',
  non_signe: 'Pas signé',
  hesite: "J'hésite encore",
};

function expectedToken(analysisId: string): string | null {
  const secret = process.env.AGENT_SECRET_KEY ?? import.meta.env.AGENT_SECRET_KEY;
  if (!secret) return null;
  return crypto.createHmac('sha256', String(secret)).update(analysisId).digest('hex');
}

function timingSafeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:480px;margin:56px auto;padding:0 16px;">
  <div style="background:#fff;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);text-align:center;">
    ${body}
    <!-- 2026-09-24 — contraste AA (WCAG 1.4.3) : #9CA3AF sur blanc ne vaut que
         2,54:1, sous le seuil de 4,5:1 pour ce corps de 12 px. #6B7280 donne
         4,83:1. Trouvé par le banc de contraste en vérifiant les éléments
         AJOUTÉS ce jour-là — le défaut, lui, est là depuis août et vaut pour
         les quatre pages d'issue. -->
    <p style="margin:26px 0 0;font-size:12px;color:#6B7280;">VerifierMonDevis.fr — l'avis d'un expert avant votre signature.</p>
  </div>
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

type Enregistrement = { ok: boolean; userId: string | null; totalHt: number | null };

async function recordOutcome(analysisId: string, choice: string, remise: number | null): Promise<Enregistrement> {
  const supabase = createServiceClient();
  const { data: analysis } = await supabase
    .from('analyses')
    .select('id, user_id, conclusion_ia, raw_text')
    .eq('id', analysisId)
    .single();
  if (!analysis) return { ok: false, userId: null, totalHt: null };

  // Montant du devis : sert uniquement à savoir si la question de financement a
  // un sens (≥ 3 000 € HT). Les deux chemins de lecture sont ceux du reste du
  // produit — `extracted` (V2) et `extracted_data` (legacy).
  let totalHt: number | null = null;
  try {
    const raw = typeof analysis.raw_text === 'string' ? JSON.parse(analysis.raw_text) : analysis.raw_text;
    const n = Number(raw?.extracted?.totaux?.ht ?? raw?.extracted_data?.totaux?.ht ?? 0);
    if (Number.isFinite(n) && n > 0) totalHt = n;
  } catch { /* montant inconnu → pas de question de financement */ }

  let verdict: string | null = null;
  try {
    const ci = typeof analysis.conclusion_ia === 'string'
      ? JSON.parse(analysis.conclusion_ia)
      : analysis.conclusion_ia;
    verdict = ci?.verdict_decisionnel ?? null;
  } catch { /* verdict snapshot optionnel */ }

  const { error } = await supabase.from('analysis_outcomes').upsert({
    analysis_id: analysisId,
    user_id: analysis.user_id,
    outcome: choice,
    ...(remise !== null ? { remise_montant: remise } : {}),
    verdict_decisionnel: verdict,
    source: 'email',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'analysis_id' });
  if (error) {
    console.error('[outcome-click] upsert:', error.message);
    return { ok: false, userId: analysis.user_id ?? null, totalHt };
  }
  return { ok: true, userId: analysis.user_id ?? null, totalHt };
}

/**
 * Bloc « financement » de la page de remerciement — chaîne vide quand la
 * question n'a pas lieu d'être. Trois conditions, toutes nécessaires :
 *
 *  1. le devis pèse au moins 3 000 € HT (même seuil que la modale) ;
 *  2. cette analyse n'a PAS déjà de réponse — sinon on demanderait deux fois la
 *     même chose à la même personne, et on compterait deux réponses pour un
 *     seul avis ;
 *  3. l'appelant ne rend aucune autre demande sur la même page (cf. `GET`).
 */
async function blocFinancement(
  analysisId: string, token: string, choice: string, totalHt: number | null,
): Promise<string> {
  if (typeof totalHt !== 'number' || totalHt < FINANCEMENT_MIN_HT) return '';

  const supabase = createServiceClient();
  const { data: deja, error } = await supabase
    .from('lead_interest')
    .select('id')
    .eq('analysis_id', analysisId)
    .eq('topic', 'credit')
    .limit(1);
  // ⚠️ En cas d'erreur de lecture on se TAIT : mieux vaut ne pas poser la
  // question que risquer de la poser deux fois et fausser le compte.
  if (error || (deja?.length ?? 0) > 0) return '';

  const action = `/api/analyse/outcome-click?id=${analysisId}&t=${encodeURIComponent(token)}&choice=${choice}`;
  const boutons = REPONSES_FINANCEMENT.map((r) =>
    `<button type="submit" name="financement" value="${r.valeur}" style="display:block;width:100%;margin:0 0 8px;padding:13px 16px;background:#fff;border:1px solid #A5B4FC;border-radius:8px;color:#312E81;font-size:15px;font-family:inherit;text-align:left;cursor:pointer;">${r.libelle}</button>`,
  ).join('');

  return `
    <div style="margin:28px 0 0;padding:22px 0 0;border-top:1px solid #E5E7EB;text-align:left;">
      <h2 style="margin:0 0 14px;font-size:16px;color:#0E1730;line-height:1.35;">Pour financer ces travaux (${Math.round(totalHt).toLocaleString('fr-FR')} &euro; HT), qu'envisagez-vous&nbsp;?</h2>
      <form method="POST" action="${action}" style="margin:0;">${boutons}</form>
      <p style="margin:16px 0 0;font-size:12.5px;color:#4B5563;line-height:1.55;">
        <strong style="color:#1F2937;">Pourquoi cette question&nbsp;?</strong>
        Nous cherchons &agrave; estimer si le financement est un frein r&eacute;el sur des chantiers de ce montant.
        Si le besoin se confirme, nous irions chercher des partenaires pour construire la meilleure solution.
        Ce service n'existe pas encore&nbsp;: votre r&eacute;ponse sert &agrave; d&eacute;cider s'il doit exister.
      </p>
      <p style="margin:8px 0 0;font-size:12px;color:#4B5563;line-height:1.55;">
        Votre r&eacute;ponse ne d&eacute;clenche aucun appel ni aucun e-mail, et n'est transmise &agrave; personne.
      </p>
    </div>`;
}

function validate(url: URL): { analysisId: string; choice: string } | Response {
  const analysisId = url.searchParams.get('id') ?? '';
  const token = url.searchParams.get('t') ?? '';
  const choice = url.searchParams.get('choice') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(analysisId) || !CHOICES.has(choice)) {
    return page('Lien invalide', `<p style="font-size:16px;color:#374151;">Ce lien est invalide ou a expiré.</p>`);
  }
  const expected = expectedToken(analysisId);
  if (!expected || !timingSafeEq(token, expected)) {
    return page('Lien invalide', `<p style="font-size:16px;color:#374151;">Ce lien est invalide ou a expiré.</p>`);
  }
  return { analysisId, choice };
}

export const GET: APIRoute = async ({ request }) => {
  const v = validate(new URL(request.url));
  if (v instanceof Response) return v;
  const { analysisId, choice } = v;

  const enr = await recordOutcome(analysisId, choice, null);
  if (!enr.ok) return page('Erreur', `<p style="font-size:16px;color:#374151;">Impossible d'enregistrer votre réponse. Réessayez depuis l'email.</p>`);

  const remiseForm = choice === 'signe_apres_negociation'
    ? `<form method="POST" action="/api/analyse/outcome-click?id=${analysisId}&t=${new URL(request.url).searchParams.get('t')}&choice=${choice}" style="margin:20px 0 0;">
        <p style="margin:0 0 8px;font-size:14px;color:#4B5563;">Bravo pour la négociation 👏 — combien avez-vous obtenu de remise ? <span style="color:#9CA3AF;">(facultatif)</span></p>
        <input type="number" name="remise" min="0" step="1" placeholder="Montant en €" inputmode="numeric" style="width:150px;padding:10px;border:1px solid #D1D5DB;border-radius:8px;font-size:15px;text-align:center;"/>
        <button type="submit" style="margin-left:8px;padding:10px 18px;background:#2563EB;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">Envoyer</button>
      </form>`
    : '';
  const backLink = choice === 'hesite'
    ? `<p style="margin:18px 0 0;"><a href="https://www.verifiermondevis.fr/analyse/${analysisId}" style="color:#2563EB;font-size:14px;">↩ Relire mon analyse et les leviers de négociation</a></p>`
    : '';

  // ⚠️ UNE SEULE DEMANDE PAR PAGE. Quand la page porte déjà le champ « remise
  // obtenue », la question de financement attend l'écran suivant (le POST
  // ci-dessous, qui ne demande plus rien). Les faire cohabiter reproduirait le
  // défaut corrigé le 16/09 : deux demandes en même temps, et on n'apprend plus
  // laquelle a été ignorée.
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const financement = remiseForm ? '' : await blocFinancement(analysisId, token, choice, enr.totalHt);

  return page('Merci !', `
    <div style="font-size:40px;">✅</div>
    <h1 style="margin:12px 0 8px;font-size:22px;color:#0E1730;">Merci, c'est noté !</h1>
    <p style="margin:0;font-size:15px;color:#4B5563;">Votre réponse : <strong>${CHOICE_LABEL[choice]}</strong>.<br/>Elle enrichit nos statistiques publiques et aide d'autres particuliers.</p>
    ${remiseForm}${backLink}${financement}`);
};

export const POST: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const v = validate(url);
  if (v instanceof Response) return v;
  const { analysisId, choice } = v;

  let remise: number | null = null;
  let financement = '';
  try {
    const form = await request.formData();
    const raw = parseFloat(String(form.get('remise') ?? ''));
    if (Number.isFinite(raw) && raw >= 0 && raw < 1_000_000) remise = raw;
    const f = String(form.get('financement') ?? '');
    if (VALEURS_FINANCEMENT.has(f)) financement = f;
  } catch { /* formulaire vide */ }

  // ─── Réponse à la question de financement ───────────────────────────────
  // ⚠️ On NE re-enregistre PAS l'issue ici : elle l'a déjà été au GET, et la
  // repasser toucherait `updated_at` sans qu'aucune issue n'ait changé.
  if (financement) {
    const supabase = createServiceClient();
    const { data: analysis } = await supabase
      .from('analyses').select('user_id, raw_text').eq('id', analysisId).single();
    let ht: number | null = null;
    try {
      const raw = typeof analysis?.raw_text === 'string' ? JSON.parse(analysis.raw_text) : analysis?.raw_text;
      const n = Number(raw?.extracted?.totaux?.ht ?? raw?.extracted_data?.totaux?.ht ?? 0);
      if (Number.isFinite(n) && n > 0) ht = n;
    } catch { /* montant optionnel */ }

    // Garde de double réponse : la page ne propose la question que si aucune
    // ligne n'existe, mais un rechargement ou un double-clic contourne l'écran.
    const { data: deja } = await supabase
      .from('lead_interest').select('id').eq('analysis_id', analysisId).eq('topic', 'credit').limit(1);
    if ((deja?.length ?? 0) === 0) {
      const { error } = await supabase.from('lead_interest').insert({
        topic: 'credit',
        analysis_id: analysisId,
        user_id: analysis?.user_id ?? null,
        montant_ht: ht,
        reponse: financement,
        source: 'relance_j15',
      });
      if (error) console.error('[outcome-click] lead_interest:', error.message);
    }
    return page('Merci !', `
      <div style="font-size:40px;">🙏</div>
      <h1 style="margin:12px 0 8px;font-size:22px;color:#0E1730;">Merci&nbsp;!</h1>
      <p style="margin:0;font-size:15px;color:#4B5563;">Votre réponse nous aide à décider si nous développons ce service.</p>`);
  }

  // ─── Réponse au champ « remise obtenue » ────────────────────────────────
  const enr = await recordOutcome(analysisId, choice, remise);
  const token = url.searchParams.get('t') ?? '';
  // Cette page-ci ne demande plus rien : la question de financement peut y
  // prendre sa place (cf. la règle « une seule demande » ci-dessus).
  const suite = await blocFinancement(analysisId, token, choice, enr.totalHt);
  return page('Merci !', `
    <div style="font-size:40px;">🤝</div>
    <h1 style="margin:12px 0 8px;font-size:22px;color:#0E1730;">Merci !</h1>
    <p style="margin:0;font-size:15px;color:#4B5563;">${remise !== null ? `${remise.toLocaleString('fr-FR')} € de remise — belle négociation.` : 'Votre réponse est enregistrée.'}</p>
    ${suite}`);
};
