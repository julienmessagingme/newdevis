-- Table company_cache pour stocker les résultats Pappers avec cache 30 jours
CREATE TABLE public.company_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siret text UNIQUE NOT NULL,
  siren text NOT NULL,
  provider text NOT NULL DEFAULT 'pappers',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ok',
  error_code text,
  error_message text,
  
  CONSTRAINT valid_status CHECK (status IN ('ok', 'error', 'not_found'))
);

-- Indexes for fast lookup
CREATE INDEX idx_company_cache_siret ON public.company_cache(siret);
CREATE INDEX idx_company_cache_siren ON public.company_cache(siren);
CREATE INDEX idx_company_cache_expires_at ON public.company_cache(expires_at);

-- Enable RLS
ALTER TABLE public.company_cache ENABLE ROW LEVEL SECURITY;

-- RLS: AUCUN accès client direct - seulement via edge functions (service_role)
-- Pas de policy SELECT/INSERT/UPDATE/DELETE pour anon ou authenticated
-- Seul le service_role_key peut accéder à cette table

-- Commentaire de documentation
COMMENT ON TABLE public.company_cache IS 'Cache des appels API Pappers - accès serveur uniquement via edge functions';