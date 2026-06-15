-- Table d'erreurs applicatives (error-tracking maison, alternative legere a Sentry).
-- Ecrite par captureError() cote Vercel (src/lib/integrations/errorReporter.ts) ET cote
-- edge functions (supabase/functions/_shared/error-reporter.ts). Sur erreur : 1 ligne ici
-- + 1 message Telegram instantane (si TELEGRAM_ERROR_BOT_TOKEN/CHAT_ID configures).
--
-- Service-role only : RLS active SANS policy => anon/authenticated = 0 acces, seul le
-- service-role (qui bypass RLS) lit/ecrit. On ne veut pas exposer les stacks aux clients.

create table if not exists public.error_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  source      text not null,                 -- ex: 'stripe-webhook', 'analyze-quote', 'whapi'
  level       text not null default 'error', -- 'error' | 'warn'
  message     text not null,
  stack       text,
  context     jsonb,                          -- { userId, chantierId, ... } libre
  user_id     uuid
);

alter table public.error_log enable row level security;

create index if not exists error_log_created_at_idx on public.error_log (created_at desc);
create index if not exists error_log_source_idx on public.error_log (source, created_at desc);
