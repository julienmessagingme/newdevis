-- ============================================================================
-- 2026-08-27 — AGENT RELECTEUR IA (chantier 3/3, décision Johan)
--
-- Chaque analyse en pending_review est relue automatiquement par un agent
-- Claude (edge function ai-review-agent, cron */10 min) qui dispose
-- d'INFORMATIONS DIFFÉRENTES du pipeline (parade à la circularité des
-- hallucinations) : le PDF source, le détail des matchs catalogue AVEC leurs
-- confidences, et une RECHERCHE WEB de prix réels. Il produit un AVIS
-- structuré (accord/désaccord + confiance + points vérifiés sourcés + notes
-- expert prêtes à coller) affiché dans /admin/reviews — l'humain garde le
-- clic final. Le taux d'accord agent↔humain se mesurera contre
-- analysis_corrections (Phase C : auto-validation calibrée à 50+ revues).
-- ============================================================================

alter table public.analyses
  add column if not exists ai_review_opinion jsonb,
  add column if not exists ai_reviewed_at timestamptz;

comment on column public.analyses.ai_review_opinion is
  'Avis structuré de l''agent relecteur IA (ai-review-agent) sur une analyse pending_review : accord, confiance, points vérifiés (web), notes proposées. Jamais d''écriture sur la conclusion — avis seulement.';

-- ── Cron toutes les 10 minutes ──────────────────────────────────────────────
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
begin
  perform cron.unschedule('ai-review-agent');
exception when others then
  null;
end $$;

select cron.schedule(
  'ai-review-agent',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/ai-review-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
