export const prerender = false;

import type { APIRoute } from 'astro';
import { optionsResponse, jsonOk, jsonError, requireChantierAuth, requireChantierAuthOrAgent } from '@/lib/apiHelpers';

// ── GET — liste contacts du chantier + artisans des devis ──────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuthOrAgent(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;

  // Parallel fetch: 6 independent queries (contacts, analyses, docChantier,
  // allDevis, chantierDevis, lots). All filter by chantier_id or user_id only.
  const [
    contactsRes,
    analysesRes,
    docChantierRes,
    allDevisRes,
    chantierDevisRes,
    lotsRes,
  ] = await Promise.all([
    // Contacts manuels
    ctx.supabase
      .from('contacts_chantier')
      .select('*')
      .eq('chantier_id', chantierId)
      .order('created_at', { ascending: false }),
    // Analyses complétées du user — source principale des infos entreprise
    ctx.supabase
      .from('analyses')
      .select('id, raw_text, created_at')
      .eq('user_id', ctx.user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false }),
    // Documents du chantier (devis/factures rattachés à des lots)
    ctx.supabase
      .from('documents_chantier')
      .select('id, lot_id, analyse_id, nom, document_type')
      .eq('chantier_id', chantierId)
      .in('document_type', ['devis', 'facture']),
    // TOUS les devis_chantier du user (pas juste ce chantier) pour croiser nom fichier → analyse_id
    ctx.supabase
      .from('devis_chantier')
      .select('artisan_nom, analyse_id, lot_id')
      .eq('user_id', ctx.user.id),
    // devis_chantier directement sur ce chantier (pour chantierAnalyseIds)
    ctx.supabase
      .from('devis_chantier')
      .select('analyse_id')
      .eq('chantier_id', chantierId)
      .not('analyse_id', 'is', null),
    // Lots pour les noms
    ctx.supabase
      .from('lots_chantier')
      .select('id, nom')
      .eq('chantier_id', chantierId),
  ]);

  const contacts = contactsRes.data;
  const analyses = analysesRes.data;
  const docChantier = docChantierRes.data;
  const allDevis = allDevisRes.data;
  const chantierDevis = chantierDevisRes.data;
  const lots = lotsRes.data;

  // ── Croisement : trouver le lot_id pour chaque analyse ────────────────
  // Étape 1 : map nom de fichier → analyse_id (depuis tous les devis du user)
  const nameToAnalyseId = new Map<string, string>();
  for (const d of allDevis ?? []) {
    if (d.analyse_id) nameToAnalyseId.set(d.artisan_nom.toLowerCase().trim(), d.analyse_id);
  }

  // Étape 2 : map analyse_id → lot_id (depuis documents de CE chantier)
  const analyseLotMap = new Map<string, string>();
  for (const doc of docChantier ?? []) {
    if (!doc.lot_id) continue;
    // Lien direct par analyse_id
    if (doc.analyse_id) {
      analyseLotMap.set(doc.analyse_id, doc.lot_id);
      continue;
    }
    // Lien par nom de fichier → devis_chantier → analyse_id
    const analyseId = nameToAnalyseId.get(doc.nom.toLowerCase().trim());
    if (analyseId) analyseLotMap.set(analyseId, doc.lot_id);
  }

  // Étape 3 : aussi depuis devis_chantier.lot_id direct (ce chantier)
  for (const d of allDevis ?? []) {
    if (d.analyse_id && d.lot_id && !analyseLotMap.has(d.analyse_id)) {
      analyseLotMap.set(d.analyse_id, d.lot_id);
    }
  }

  // ── Collecter les analyse_id liés à CE chantier ────────────────────────
  // Via documents_chantier (direct ou par nom de fichier)
  const chantierAnalyseIds = new Set<string>();
  for (const doc of docChantier ?? []) {
    if (doc.analyse_id) chantierAnalyseIds.add(doc.analyse_id);
    // Par nom de fichier → devis_chantier → analyse_id
    const aId = nameToAnalyseId.get(doc.nom.toLowerCase().trim());
    if (aId) chantierAnalyseIds.add(aId);
  }
  // Via devis_chantier directement sur ce chantier (déjà fetché en parallel)
  for (const d of chantierDevis ?? []) {
    if (d.analyse_id) chantierAnalyseIds.add(d.analyse_id);
  }

  // Via analyse_id stocké sur les contacts du chantier (nouvellement peuplé)
  for (const c of contacts ?? []) {
    if (c.analyse_id) chantierAnalyseIds.add(c.analyse_id);
  }

  // Matching fuzzy : pour les documents sans analyse_id, chercher une analyse
  // dont le nom officiel / nom entreprise apparaît dans le nom du document
  for (const doc of docChantier ?? []) {
    if (doc.analyse_id) continue; // déjà traité
    const docNameLower = doc.nom.toLowerCase();
    for (const a of analyses ?? []) {
      if (chantierAnalyseIds.has(a.id)) continue;
      try {
        const raw = typeof a.raw_text === 'string' ? JSON.parse(a.raw_text) : a.raw_text;
        const artisanNom = ((raw?.verified?.nom_officiel || raw?.extracted?.entreprise?.nom) as string | undefined)
          ?.toLowerCase().trim() ?? '';
        // Match si le nom de l'entreprise (≥4 chars) est contenu dans le nom du document
        if (artisanNom.length >= 4 && docNameLower.includes(artisanNom)) {
          chantierAnalyseIds.add(a.id);
        }
      } catch { /* skip */ }
    }
  }

  // Aussi inclure toutes les analyses dont le SIRET correspond à un analyse_id déjà lié
  const linkedSirets = new Set<string>();
  for (const a of analyses ?? []) {
    if (!chantierAnalyseIds.has(a.id)) continue;
    try {
      const raw = typeof a.raw_text === 'string' ? JSON.parse(a.raw_text) : a.raw_text;
      const siret = raw?.extracted?.entreprise?.siret;
      if (siret) linkedSirets.add(siret);
    } catch { /* skip */ }
  }

  // ── Extraire les artisans (seulement ceux liés au chantier, dédupliqués par SIRET) ──
  type ArtisanRow = {
    analyse_id: string; nom: string; nom_officiel: string | null;
    siret: string | null; email: string | null; telephone: string | null;
    lot_id: string | null;
  };
  const bySiret = new Map<string, ArtisanRow>();
  const byName  = new Map<string, ArtisanRow>();

  for (const a of analyses ?? []) {
    try {
      const raw = typeof a.raw_text === 'string' ? JSON.parse(a.raw_text) : a.raw_text;
      const ent = raw?.extracted?.entreprise;
      if (!ent?.nom) continue;

      const siret = ent.siret || null;
      // Filtrer : seulement si cette analyse ou ce SIRET est lié au chantier
      const isLinked = chantierAnalyseIds.has(a.id) || (siret && linkedSirets.has(siret));
      if (!isLinked) continue;

      const row: ArtisanRow = {
        analyse_id: a.id,
        nom: raw?.verified?.nom_officiel || ent.nom,
        nom_officiel: raw?.verified?.nom_officiel || null,
        siret,
        email: ent.email || null,
        telephone: ent.telephone || null,
        lot_id: analyseLotMap.get(a.id) || null,
      };

      const key = siret || row.nom.toLowerCase();
      const map = siret ? bySiret : byName;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, row);
      } else if (row.lot_id && !existing.lot_id) {
        map.set(key, row);
      }
    } catch { /* skip malformed */ }
  }

  const seenNames = new Set([...bySiret.values()].map(r => r.nom.toLowerCase()));
  const analyseArtisans = [
    ...bySiret.values(),
    ...[...byName.values()].filter(r => !seenNames.has(r.nom.toLowerCase())),
  ];

  // Lots (déjà fetchés en parallel plus haut)
  return jsonOk({
    contacts: contacts ?? [],
    analyseArtisans,
    lots: lots ?? [],
  });
};

// ── POST — créer un contact ────────────────────────────────────────────────

export const POST: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;
  const body = await request.json();
  const nom = (body.nom ?? '').trim();
  if (!nom) return jsonError('Nom requis', 400);

  const { data, error } = await ctx.supabase
    .from('contacts_chantier')
    .insert({
      chantier_id: chantierId,
      user_id: ctx.user.id,
      nom,
      email: body.email?.trim() || null,
      telephone: body.telephone?.trim() || null,
      siret: body.siret?.trim() || null,
      role: body.role?.trim() || null,
      contact_category: ['artisan','architecte','maitre_oeuvre','bureau_etudes','client','autre'].includes(body.contact_category) ? body.contact_category : 'artisan',
      lot_id: body.lot_id || null,
      notes: body.notes?.trim() || null,
      source: body.source ?? 'manual',
      devis_id: body.devis_id || null,
      analyse_id: body.analyse_id || null,
    })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);

  // Invalidate agent context cache (new contact = stale phone→lot mapping)
  ctx.supabase.from('agent_context_cache')
    .update({ invalidated: true })
    .eq('chantier_id', chantierId)
    .then(() => {}).catch(() => {});

  return jsonOk({ contact: data }, 201);
};

// ── PATCH — modifier un contact ────────────────────────────────────────────

export const PATCH: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;
  const body = await request.json();
  if (!body.contactId) return jsonError('contactId requis', 400);

  const updates: Record<string, unknown> = {};
  if (body.nom !== undefined)       updates.nom       = body.nom.trim();
  if (body.email !== undefined)     updates.email     = body.email?.trim() || null;
  if (body.telephone !== undefined) updates.telephone = body.telephone?.trim() || null;
  if (body.siret !== undefined)     updates.siret     = body.siret?.trim() || null;
  if (body.role !== undefined)      updates.role      = body.role?.trim() || null;
  if (body.contact_category !== undefined && ['artisan','architecte','maitre_oeuvre','bureau_etudes','client','autre'].includes(body.contact_category)) {
    updates.contact_category = body.contact_category;
  }
  if (body.lot_id !== undefined)    updates.lot_id    = body.lot_id || null;
  if (body.notes !== undefined)     updates.notes     = body.notes?.trim() || null;

  const { data, error } = await ctx.supabase
    .from('contacts_chantier')
    .update(updates)
    .eq('id', body.contactId)
    .eq('chantier_id', chantierId)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);

  // Invalidate agent context cache (updated contact = stale phone→lot mapping)
  ctx.supabase.from('agent_context_cache')
    .update({ invalidated: true })
    .eq('chantier_id', chantierId)
    .then(() => {}).catch(() => {});

  return jsonOk({ contact: data });
};

// ── DELETE — supprimer un contact ──────────────────────────────────────────

export const DELETE: APIRoute = async ({ params, request }) => {
  const ctx = await requireChantierAuth(request, params.id!);
  if (ctx instanceof Response) return ctx;

  const chantierId = params.id!;
  const body = await request.json();
  if (!body.contactId) return jsonError('contactId requis', 400);

  const { error } = await ctx.supabase
    .from('contacts_chantier')
    .delete()
    .eq('id', body.contactId)
    .eq('chantier_id', chantierId);

  if (error) return jsonError(error.message, 500);

  // Invalidate agent context cache (deleted contact = stale phone→lot mapping)
  ctx.supabase.from('agent_context_cache')
    .update({ invalidated: true })
    .eq('chantier_id', chantierId)
    .then(() => {}).catch(() => {});

  return jsonOk({ ok: true });
};

// ── OPTIONS ────────────────────────────────────────────────────────────────

export const OPTIONS: APIRoute = () => optionsResponse();
