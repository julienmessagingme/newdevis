-- ============================================================================
-- 2026-08-29 — RPC de diagnostic pg_cron (l'agent relecteur ne se déclenchait
-- pas : ai_reviewed_at restait null alors que le job est censé tourner toutes
-- les 10 min). Impossible de lire cron.job depuis PostgREST sans passer par
-- une fonction : celle-ci expose l'état des jobs + leurs derniers runs.
-- service_role uniquement. Réutilisable pour tous les crons du projet.
-- ============================================================================

create or replace function public.admin_cron_status(p_job text default null)
returns jsonb
language sql
security definer
set search_path = public, cron
as $$
  select jsonb_build_object(
    'jobs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'jobid', j.jobid, 'jobname', j.jobname, 'schedule', j.schedule,
        'active', j.active, 'command', left(j.command, 300)
      ) order by j.jobname), '[]'::jsonb)
      from cron.job j
      where p_job is null or j.jobname = p_job
    ),
    -- NB : cron.job_run_details n'expose pas jobname dans cette version de
    -- pg_cron — jointure par jobid.
    'recent_runs', (
      select coalesce(jsonb_agg(r), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'jobname', j.jobname, 'status', d.status,
          'return_message', left(coalesce(d.return_message, ''), 300),
          'start_time', d.start_time
        ) as r
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
        where p_job is null or j.jobname = p_job
        order by d.start_time desc
        limit 20
      ) s
    )
  );
$$;

revoke all on function public.admin_cron_status(text) from public, anon, authenticated;
grant execute on function public.admin_cron_status(text) to service_role;
