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
    <p style="margin:26px 0 0;font-size:12px;color:#9CA3AF;">VerifierMonDevis.fr — l'avis d'un expert avant votre signature.</p>
  </div>
</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function recordOutcome(analysisId: string, choice: string, remise: number | null): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: analysis } = await supabase
    .from('analyses')
    .select('id, user_id, conclusion_ia')
    .eq('id', analysisId)
    .single();
  if (!analysis) return false;

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
    return false;
  }
  return true;
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

  const ok = await recordOutcome(analysisId, choice, null);
  if (!ok) return page('Erreur', `<p style="font-size:16px;color:#374151;">Impossible d'enregistrer votre réponse. Réessayez depuis l'email.</p>`);

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

  return page('Merci !', `
    <div style="font-size:40px;">✅</div>
    <h1 style="margin:12px 0 8px;font-size:22px;color:#0E1730;">Merci, c'est noté !</h1>
    <p style="margin:0;font-size:15px;color:#4B5563;">Votre réponse : <strong>${CHOICE_LABEL[choice]}</strong>.<br/>Elle enrichit nos statistiques publiques et aide d'autres particuliers.</p>
    ${remiseForm}${backLink}`);
};

export const POST: APIRoute = async ({ request }) => {
  const v = validate(new URL(request.url));
  if (v instanceof Response) return v;
  const { analysisId, choice } = v;

  let remise: number | null = null;
  try {
    const form = await request.formData();
    const raw = parseFloat(String(form.get('remise') ?? ''));
    if (Number.isFinite(raw) && raw >= 0 && raw < 1_000_000) remise = raw;
  } catch { /* formulaire vide */ }

  await recordOutcome(analysisId, choice, remise);
  return page('Merci !', `
    <div style="font-size:40px;">🤝</div>
    <h1 style="margin:12px 0 8px;font-size:22px;color:#0E1730;">Merci !</h1>
    <p style="margin:0;font-size:15px;color:#4B5563;">${remise !== null ? `${remise.toLocaleString('fr-FR')} € de remise — belle négociation.` : 'Votre réponse est enregistrée.'}</p>`);
};
