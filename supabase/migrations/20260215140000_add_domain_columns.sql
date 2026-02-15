-- Add domain column to key tables for multi-vertical support
-- Default 'travaux' ensures zero regression on existing data

ALTER TABLE analyses ADD COLUMN domain TEXT NOT NULL DEFAULT 'travaux';
ALTER TABLE market_prices ADD COLUMN domain TEXT NOT NULL DEFAULT 'travaux';
ALTER TABLE price_observations ADD COLUMN domain TEXT NOT NULL DEFAULT 'travaux';

CREATE INDEX idx_analyses_domain ON analyses(domain);
CREATE INDEX idx_market_prices_domain ON market_prices(domain);
CREATE INDEX idx_price_obs_domain ON price_observations(domain);
