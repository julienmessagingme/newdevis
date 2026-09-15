-- 2026-09-15 — PRIX DU MATÉRIEL IDENTIFIÉ PAR SA RÉFÉRENCE FABRICANT (vertical clim).
--
-- POURQUOI UNE TABLE À PART, ET PAS DES ENTRÉES `market_prices`.
-- `market_prices` chiffre un OUVRAGE (un m² de peinture, un ml de gouttière) et
-- se retrouve par SIMILARITÉ SÉMANTIQUE. Ici la clé est une RÉFÉRENCE FABRICANT
-- et le rapprochement doit être LITTÉRAL : le matcher vectoriel confondrait un
-- MXZ-4F72VF4 et un MXZ-2F53VF4 — deux produits séparés par 900 €. Sur un
-- chiffre qu'on oppose nommément à un artisan, l'à-peu-près n'est pas permis.
-- Ces entrées ne sont donc PAS embarquées dans l'index vectoriel.
--
-- 🔴 CINQ PIÈGES MESURÉS LE 15/09, DONT QUATRE DESSERVENT L'UTILISATEUR.
--  1. Le « prix public » CONSTRUCTEUR vaut 2 à 2,5× le prix réel (Daikin 4MXM80
--     annoncé 6 006 € contre 2 416 € · Mitsubishi MXZ-4F72 5 116 € contre 1 966 €
--     · MSZ-AY25 « conseillé 883 € » contre 429 €). Le sourcer ABSOUDRAIT tout le
--     monde — c'est le signal qui flatte le devis, refusé par principe (11/09).
--  2. Une même référence désigne DEUX produits : MSZ-AY25VGK vaut 1 059 € en pack
--     monosplit et 381 € en unité intérieure seule (×2,8). D'où `perimetre`.
--  3. HT/TTC : une « dispersion ×2,2 » observée au premier jet était un artefact
--     de comparaison HT contre TTC. Corrigée : ×1,2.
--  4. Les prix d'IMPORT à long délai (Portugal 25-40 j) sont 15-20 % sous le prix
--     France. Les opposer à un artisan qui livre en une semaine serait déloyal :
--     ils sont écartés du calcul, pas stockés.
--  5. Comparer un MONTANT DE LIGNE à un PRIX UNITAIRE. La ligne FTXM42 du devis
--     VOLTELEC porte q=2 : l'écart réel est +44 %, pas +184 %. La comparaison se
--     fait sur le PRIX UNITAIRE, sinon on accuse un artisan qui est dans la norme.
--
-- 🟢 LA MARGE D'INSTALLATEUR EST UNE RÉGULARITÉ MESURÉE, PAS UNE HYPOTHÈSE :
-- +30 à +50 % sur 11 des 17 références, chez des artisans différents, sur deux
-- marques, de 300 € à 2 600 €. Elle donne les seuils (validés Johan 15/09) :
--   < +50 %      on se taît — c'est la marge du métier, la nommer nous ferait
--                passer pour naïfs ;
--   +50 à +70 %  on mentionne sans accuser ;
--   > +70 %      on demande une explication.
-- ⚠️ Un devis du corpus facture 16 % SOUS le prix distributeur (Bosch CL5000M) :
-- notre référence n'est PAS un plancher, et +50 % garde une vraie marge de sûreté.
--
-- ⚠️ ON NE CALCULE JAMAIS LA MARGE DE L'ARTISAN. On ne compare pas à ce qu'il a
-- payé (inconnaissable, dépend de son négociant) mais à ce que le client paierait
-- en achetant lui-même. Un artisan dans la fourchette est normal : sa marge EST
-- sa remise d'achat, c'est son métier.

create table if not exists public.prix_materiel (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null,
  reference_normalisee text not null,
  marque               text not null,
  famille              text not null check (famille in
                         ('groupe_ext_multi','mural','console','gainable','pac_air_eau')),
  -- 🔴 PIÈGE 2 : 'unite_seule' ne se compare QU'À une ligne qui ne porte ni la
  -- pose ni le groupe extérieur. 'ensemble' = intérieur + extérieur vendus ensemble.
  perimetre            text not null check (perimetre in ('unite_seule','ensemble')),
  designation          text not null,
  prix_min_ht          numeric not null check (prix_min_ht > 0),
  prix_max_ht          numeric not null,
  nb_sources           int    not null,
  sources              jsonb  not null,
  releve_le            date   not null,
  perime_le            date   not null,
  created_at           timestamptz not null default now(),
  -- 🔴 LA RÈGLE DES DEUX SOURCES VIT DANS LA BASE, PAS DANS LA DISCIPLINE.
  -- Une fourchette à source unique deviendrait opposable à un artisan sans
  -- confirmation : la contrainte rend sa publication IMPOSSIBLE.
  constraint prix_materiel_deux_sources check (nb_sources >= 2),
  constraint prix_materiel_fourchette   check (prix_max_ht >= prix_min_ht),
  constraint prix_materiel_peremption   check (perime_le > releve_le)
);

create unique index if not exists prix_materiel_ref_uniq
  on public.prix_materiel (reference_normalisee);

alter table public.prix_materiel enable row level security;

-- Lecture publique : ces prix sont affichés dans l'analyse. Écriture réservée
-- au service_role (migrations), comme le catalogue.
drop policy if exists prix_materiel_lecture on public.prix_materiel;
create policy prix_materiel_lecture on public.prix_materiel for select using (true);

insert into public.prix_materiel
  (reference, reference_normalisee, marque, famille, perimetre, designation,
   prix_min_ht, prix_max_ht, nb_sources, sources, releve_le, perime_le)
values
  ('2MXM68A8/A9', '2MXM68A8A9', 'Daikin', 'groupe_ext_multi', 'unite_seule',
   'groupe ext 2 sorties 6,8 kW', 1640.83, 1708.25, 2,
   '[{"distributeur":"climneo","prix_ht":1708.25},{"distributeur":"clim-planete","prix_ht":1640.83}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('4MXM80A8/A9', '4MXM80A8A9', 'Daikin', 'groupe_ext_multi', 'unite_seule',
   'groupe ext 4 sorties 8,0 kW', 2415.83, 2576.28, 2,
   '[{"distributeur":"clim-planete","prix_ht":2415.83},{"distributeur":"gus-astuces","prix_ht":2576.28}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('CTXM15A', 'CTXM15A', 'Daikin', 'mural', 'unite_seule',
   'mural 1,5 kW (unite seule)', 290.83, 307.5, 2,
   '[{"distributeur":"climonline","prix_ht":290.83},{"distributeur":"condizionati","prix_ht":307.5}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('FTXM42A', 'FTXM42A', 'Daikin', 'mural', 'unite_seule',
   'mural 4,2 kW (unite seule)', 524.17, 532.5, 2,
   '[{"distributeur":"climonline","prix_ht":524.17},{"distributeur":"climplus","prix_ht":532.5}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MFZ-KT25VG', 'MFZKT25VG', 'Mitsubishi', 'console', 'unite_seule',
   'console 2,5 kW (unite seule)', 729.17, 773.75, 2,
   '[{"distributeur":"climshop","prix_ht":729.17},{"distributeur":"climfactory","prix_ht":773.75}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MFZ-KT35VG', 'MFZKT35VG', 'Mitsubishi', 'console', 'unite_seule',
   'console 3,5 kW (unite seule)', 792.5, 840.42, 2,
   '[{"distributeur":"climshop","prix_ht":792.5},{"distributeur":"climfactory","prix_ht":840.42}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MSZ-AY15VGK', 'MSZAY15VGK', 'Mitsubishi', 'mural', 'unite_seule',
   'mural 1,5 kW (unite seule)', 307.5, 334, 2,
   '[{"distributeur":"climonline","prix_ht":307.5},{"distributeur":"climfactory","prix_ht":334}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MSZ-AY20VGK', 'MSZAY20VGK', 'Mitsubishi', 'mural', 'unite_seule',
   'mural 2,0 kW (unite seule)', 324.17, 351, 2,
   '[{"distributeur":"climonline","prix_ht":324.17},{"distributeur":"climfactory","prix_ht":351}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MSZ-AY25VGK', 'MSZAY25VGK', 'Mitsubishi', 'mural', 'unite_seule',
   'mural 2,5 kW (unite seule)', 349.17, 370, 3,
   '[{"distributeur":"climonline","prix_ht":349.17},{"distributeur":"climfactory fiche","prix_ht":357.5},{"distributeur":"climfactory cat.","prix_ht":370}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MSZ-AY35VGK', 'MSZAY35VGK', 'Mitsubishi', 'mural', 'unite_seule',
   'mural 3,5 kW (unite seule)', 399.17, 429, 2,
   '[{"distributeur":"climonline","prix_ht":399.17},{"distributeur":"climfactory","prix_ht":429}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MSZ-AY42VGK', 'MSZAY42VGK', 'Mitsubishi', 'mural', 'unite_seule',
   'mural 4,2 kW (unite seule)', 462.5, 498, 2,
   '[{"distributeur":"climonline","prix_ht":462.5},{"distributeur":"climfactory","prix_ht":498}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MXZ-2F33VF4', 'MXZ2F33VF4', 'Mitsubishi', 'groupe_ext_multi', 'unite_seule',
   'groupe ext 2 sorties 3,3 kW', 874.17, 1030.45, 3,
   '[{"distributeur":"climplus","prix_ht":1030.45},{"distributeur":"clim-planete FR","prix_ht":882.5},{"distributeur":"climfactory","prix_ht":874.17}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MXZ-2F53VF4', 'MXZ2F53VF4', 'Mitsubishi', 'groupe_ext_multi', 'unite_seule',
   'groupe ext 2 sorties 5,3 kW', 1165.83, 1417.78, 2,
   '[{"distributeur":"domotelec","prix_ht":1417.78},{"distributeur":"climfactory","prix_ht":1165.83}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MXZ-3F68VF4', 'MXZ3F68VF4', 'Mitsubishi', 'groupe_ext_multi', 'unite_seule',
   'groupe ext 3 sorties 6,8 kW', 1582.5, 1980.28, 2,
   '[{"distributeur":"gus-astuces","prix_ht":1980.28},{"distributeur":"climfactory","prix_ht":1582.5}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('MXZ-4F72VF4', 'MXZ4F72VF4', 'Mitsubishi', 'groupe_ext_multi', 'unite_seule',
   'groupe ext 4 sorties 7,2 kW', 1874.17, 2334.61, 3,
   '[{"distributeur":"gus-astuces","prix_ht":2334.61},{"distributeur":"clim-planete FR","prix_ht":1965.83},{"distributeur":"climfactory","prix_ht":1874.17}]'::jsonb, '2026-09-15', '2026-12-15'),
  ('PEAD-M60JA + SUZ-M60VA', 'PEADM60JASUZM60VA', 'Mitsubishi', 'gainable', 'ensemble',
   'gainable 6 kW (ensemble)', 2107.5, 2132.5, 2,
   '[{"distributeur":"climonline","prix_ht":2132.5},{"distributeur":"clim-planete","prix_ht":2107.5}]'::jsonb, '2026-09-15', '2026-12-15')
on conflict (reference_normalisee) do nothing;

comment on table public.prix_materiel is
  'Prix distributeur grand public du matériel identifié par sa référence fabricant. JAMAIS le tarif catalogue constructeur (2 à 2,5× le réel). Relevé daté, à re-vérifier chaque trimestre.';
