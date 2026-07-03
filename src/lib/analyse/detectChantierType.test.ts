import { describe, it, expect } from 'vitest';
import { detectChantierSlug } from './detectChantierType';

describe('detectChantierSlug', () => {
  it('renvoie null pour un input vide/absent', () => {
    expect(detectChantierSlug(null)).toBeNull();
    expect(detectChantierSlug(undefined)).toBeNull();
    expect(detectChantierSlug([])).toBeNull();
    expect(detectChantierSlug([{ description: '' }])).toBeNull();
  });

  it('detecte salle de bain sur signal clair', () => {
    expect(
      detectChantierSlug([
        { description: 'Fourniture et pose douche italienne' },
        { description: 'Vasque salle de bain avec meuble' },
        { description: 'Mitigeur thermostatique' },
      ]),
    ).toBe('salle-de-bain');
  });

  it('detecte cuisine', () => {
    expect(
      detectChantierSlug([
        { description: 'Plan de travail granit noir' },
        { description: 'Hotte aspirante 90 cm' },
        { description: 'Meuble haut cuisine 60cm' },
      ]),
    ).toBe('cuisine');
  });

  it('detecte isolation combles', () => {
    expect(
      detectChantierSlug([
        { description: 'Isolation combles perdus laine de verre 300mm' },
        { description: 'Pare-vapeur' },
      ]),
    ).toBe('isolation');
  });

  it('detecte toiture avec plusieurs signaux', () => {
    expect(
      detectChantierSlug([
        { description: 'Depose ancienne couverture tuiles' },
        { description: 'Pose tuiles terre cuite neuves' },
        { description: 'Zinguerie faitage' },
      ]),
    ).toBe('toiture');
  });

  it('detecte chauffage pompe a chaleur', () => {
    expect(
      detectChantierSlug([
        { description: 'Depose ancienne chaudiere fioul' },
        { description: 'Pose pompe a chaleur air-eau 12kW' },
        { description: 'Radiateur bain d\'huile' },
      ]),
    ).toBe('chauffage');
  });

  it('utilise la categorie si description generique', () => {
    expect(
      detectChantierSlug([
        { description: 'Fourniture materiaux', categorie: 'peinture interieure' },
        { description: 'Main d\'oeuvre', categorie: 'peinture' },
        { description: 'Preparation mur', categorie: 'peinture' },
      ]),
    ).toBe('peinture');
  });

  it('renvoie null quand signal ambigu (deux chantiers a egalite)', () => {
    // 1 salle-de-bain, 1 cuisine — pas de gagnant net
    expect(
      detectChantierSlug([
        { description: 'Fourniture douche' },
        { description: 'Fourniture plan de travail' },
      ]),
    ).toBeNull();
  });

  it('renvoie le winner si nettement au-dessus (>= 2x second)', () => {
    // 4 matches carrelage, 1 match plomberie
    expect(
      detectChantierSlug([
        { description: 'Depose carrelage sol' },
        { description: 'Ragreage' },
        { description: 'Pose carrelage gres cerame' },
        { description: 'Joints carrelage' },
        { description: 'Raccordement plomberie' },
      ]),
    ).toBe('carrelage');
  });

  it('exige au moins 2 matches (evite les detections faibles)', () => {
    expect(
      detectChantierSlug([
        { description: 'Un petit truc de plomberie' },
      ]),
    ).toBeNull();
  });

  it('detecte fenetres', () => {
    expect(
      detectChantierSlug([
        { description: 'Fourniture et pose fenetre PVC double vitrage' },
        { description: 'Depose ancienne fenetre bois' },
      ]),
    ).toBe('fenetres');
  });

  it('ne confond pas chauffe-eau avec electricite', () => {
    // "chauffe-eau" est un match chauffage, on ne doit pas retomber sur electricite
    // meme si sanitaire mentionne. La logique de scoring gere.
    expect(
      detectChantierSlug([
        { description: 'Chauffe-eau thermodynamique 200L' },
        { description: 'Raccordement chauffe-eau' },
      ]),
    ).toBe('chauffage');
  });
});
