-- 2026-09-10 — ÉTALON DU RAPPROCHEMENT LIGNE DE DEVIS ↔ CATALOGUE.
--
-- Pourquoi cette table existe : jusqu'ici, aucune liste ne disait « cette ligne
-- de devis correspond à cette entrée du catalogue ». Sans elle, toute
-- modification du matcher se jugeait à l'intuition. Le 2026-09-10, 150 lignes
-- ont été relues à la main par Johan puis par gemini-2.5-pro ; les deux
-- jugements vivent ici, avec le contexte exact qui a été montré aux relecteurs.
--
-- ⚠️ ELLE NE PEUT PAS VIVRE DANS LE DÉPÔT : elle contient des lignes de devis de
-- clients réels et le dépôt GitHub est PUBLIC. C'est la raison d'être de cette
-- migration — sortir l'étalon de deux fichiers posés sur un poste de travail.
--
-- ⚠️ AUCUNE POLICY RLS N'EST CRÉÉE, ET C'EST VOULU : RLS activé sans policy =
-- personne n'y accède, sauf `service_role` qui la contourne par construction.
-- Les scripts de mesure tournent en service_role ; le front n'a rien à y lire.

CREATE TABLE IF NOT EXISTS public.match_gold_standard (
  -- Identifiant stable de la question (L001…), pour recoller les réponses.
  id                 TEXT PRIMARY KEY,

  -- Ce qui a été montré au relecteur, et ce qui permet de REJOUER la mesure.
  ligne_devis        TEXT NOT NULL,
  -- Texte réellement embarqué par la production (`buildQueryEmbeddingText`) :
  -- description + « Catégorie : … » + « Unité : … ». Le conserver évite d'avoir
  -- à le reconstituer — et de se tromper en le reconstituant.
  texte_requete      TEXT NOT NULL,
  contexte           JSONB,          -- { qte, unite, montant_ht, categorie }
  -- Les 5 candidats DANS L'ORDRE DU VECTORIEL au moment de la relecture :
  -- [{ rang, job_type, label, similarity }]. Le rang 1 est ce que la production
  -- aurait choisi ; c'est contre lui que se mesure tout progrès.
  candidats          JSONB NOT NULL,
  -- Vrai si la ligne était déjà rapprochée en confiance haute : ces lignes
  -- servent à détecter les RÉGRESSIONS, pas les gains.
  temoin             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Jugements. Format commun : '1'..'5' (rang du bon candidat), '0' (aucun ne
  -- convient), '?' (ligne trop mal rédigée pour être jugée), ou plusieurs rangs
  -- séparés par '|' quand le devis ne permet pas de trancher entre eux
  -- (matériau non précisé, mur porteur ou non…).
  reponse_humaine    TEXT,
  commentaire_humain TEXT,
  relecteur          TEXT,
  reponse_ia         TEXT,
  raison_ia          TEXT,
  modele_ia          TEXT,

  -- Les deux juges disent la même chose. ⚠️ C'est CE sous-ensemble qui fait
  -- référence : mesuré le 2026-09-10, deux juges compétents ne s'accordent que
  -- sur 55 % des cas, donc un étalon à un seul juge a ce plafond-là.
  consensus          BOOLEAN,

  cree_le            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  maj_le             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.match_gold_standard IS
  'Étalon humain + IA du rapprochement ligne de devis ↔ catalogue de prix. Contient des extraits de devis clients : jamais exposé au front, service_role uniquement.';

-- Le sous-ensemble de consensus est celui qu''on interroge le plus souvent.
CREATE INDEX IF NOT EXISTS idx_match_gold_consensus
  ON public.match_gold_standard (consensus) WHERE consensus IS TRUE;

ALTER TABLE public.match_gold_standard ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.match_gold_standard_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.maj_le := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_gold_standard_touch ON public.match_gold_standard;
CREATE TRIGGER trg_match_gold_standard_touch
  BEFORE UPDATE ON public.match_gold_standard
  FOR EACH ROW EXECUTE FUNCTION public.match_gold_standard_touch();
