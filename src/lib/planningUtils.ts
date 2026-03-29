/**
 * Planning utilities — fonctions pures partagées entre frontend et API.
 * Gère le calcul des dates, jours ouvrés, et ordonnancement des lots.
 */
import type { LotChantier } from '@/types/chantier-ia';

// ── Jours ouvrés ──────────────────────────────────────────────────────────────

/** Ajoute N jours ouvrés à une date (skip samedi/dimanche) */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

/** Nombre de jours ouvrés entre 2 dates (exclusif de start, inclusif de end) */
export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ── Calcul du planning ────────────────────────────────────────────────────────

/**
 * Recalcule date_debut et date_fin de chaque lot à partir de la date de départ.
 *
 * Algorithme :
 * 1. Trier par ordre_planning
 * 2. Grouper les lots ayant le même parallel_group (non null)
 * 3. Les lots d'un même groupe parallèle démarrent en même temps
 * 4. Le groupe suivant démarre après la fin du lot le plus long du groupe précédent
 * 5. Les lots avec parallel_group=null sont traités comme des groupes solo
 *
 * Retourne une copie des lots avec date_debut/date_fin mis à jour.
 */
export function computePlanningDates(lots: LotChantier[], startDate: Date): LotChantier[] {
  // Copie et tri par ordre_planning
  const sorted = [...lots]
    .filter(l => l.ordre_planning != null && l.duree_jours != null && l.duree_jours > 0)
    .sort((a, b) => (a.ordre_planning ?? 0) - (b.ordre_planning ?? 0));

  // Lots sans planning data → retourner tels quels
  const withoutPlanning = lots.filter(l => l.ordre_planning == null || l.duree_jours == null || l.duree_jours <= 0);

  // Grouper par séquence de parallel_group
  const groups: LotChantier[][] = [];
  let currentGroup: LotChantier[] = [];
  let currentPG: number | null | undefined = undefined;

  for (const lot of sorted) {
    const pg = lot.parallel_group;
    if (pg != null && pg === currentPG) {
      // Même groupe parallèle → ajouter au groupe courant
      currentGroup.push(lot);
    } else {
      // Nouveau groupe
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [lot];
      currentPG = pg;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Calculer les dates
  let cursor = new Date(startDate);
  const result: LotChantier[] = [];

  for (const group of groups) {
    let maxEnd = cursor;

    for (const lot of group) {
      const debut = new Date(cursor);
      const fin = addBusinessDays(debut, lot.duree_jours!);

      result.push({
        ...lot,
        date_debut: debut.toISOString().split('T')[0],
        date_fin: fin.toISOString().split('T')[0],
      });

      if (fin > maxEnd) maxEnd = fin;
    }

    // Le prochain groupe démarre après le plus long de ce groupe
    cursor = maxEnd;
  }

  // Ajouter les lots sans planning (inchangés)
  return [...result, ...withoutPlanning];
}

// ── Formatage ─────────────────────────────────────────────────────────────────

/** "2 semaines", "3 jours", "1 semaine et 2 jours" */
export function formatDuration(days: number): string {
  if (days <= 0) return '—';
  const weeks = Math.floor(days / 5);
  const remaining = days % 5;

  if (weeks === 0) return `${remaining} jour${remaining > 1 ? 's' : ''}`;
  if (remaining === 0) return `${weeks} semaine${weeks > 1 ? 's' : ''}`;
  return `${weeks} sem. et ${remaining}j`;
}

/** Numéro de semaine relative (S1, S2...) depuis la date de début du chantier */
export function getWeekNumber(date: Date, startDate: Date): number {
  const diffMs = date.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

/** Nombre total de semaines couvertes par le planning */
export function getTotalWeeks(lots: LotChantier[]): number {
  const withDates = lots.filter(l => l.date_debut && l.date_fin);
  if (withDates.length === 0) return 0;

  const starts = withDates.map(l => new Date(l.date_debut!).getTime());
  const ends = withDates.map(l => new Date(l.date_fin!).getTime());

  const earliest = Math.min(...starts);
  const latest = Math.max(...ends);
  const diffDays = Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24));

  return Math.ceil(diffDays / 7) || 1;
}

/** Génère les labels de semaines (S1, S2...) avec la date de début de chaque semaine */
export function getWeekLabels(startDate: Date, totalWeeks: number): { label: string; date: string }[] {
  const labels: { label: string; date: string }[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + i * 7);
    labels.push({
      label: `S${i + 1}`,
      date: weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    });
  }
  return labels;
}

/** Parse une date ISO string en Date (safe, retourne null si invalide) */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
