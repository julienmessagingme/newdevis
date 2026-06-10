/**
 * Constantes `sameAs` pour les JSON-LD SoftwareApplication / Organization.
 *
 * Pourquoi centraliser : les comptes sociaux peuvent évoluer (création,
 * fermeture, changement d'URL). Centraliser ici évite d'avoir à grep + Edit
 * 15+ pages pour chaque mise à jour. Les 3 footers utilisent les URLs en dur
 * (HTML inline avec ARIA), eux ne peuvent pas importer ce fichier.
 *
 * Convention Google :
 *   - sameAs[] doit lister UNIQUEMENT les comptes officiels DE L'ENTITÉ que
 *     la page représente.
 *   - VMD (verifiermondevis.fr) → comptes VMD + Facebook mutualisé.
 *   - GMC (gerermonchantier.fr) → comptes GMC + Facebook mutualisé + TikTok GMC.
 *
 * Le Facebook est listé dans les 2 car il représente officiellement les 2
 * marques (même portefeuille Meta Business "Gerermonchantier", cf. CLAUDE.md
 * section "Tracking / Pixels publicitaires").
 */

export const SAME_AS_VMD: readonly string[] = [
  'https://www.instagram.com/verifiermondevis/',
  'https://www.facebook.com/profile.php?id=61590412092738',
] as const;

export const SAME_AS_GMC: readonly string[] = [
  'https://www.instagram.com/gerermonchantier.fr/',
  'https://www.facebook.com/profile.php?id=61590412092738',
  'https://www.tiktok.com/@gerermonchantier',
] as const;
