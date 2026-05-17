/**
 * journalExport — génération des exports du Journal de chantier (PDF + CSV).
 *
 * - PDF  : rapport mis en page (récit + timeline) via jsPDF.
 * - CSV  : timeline en lignes, séparateur `;` + BOM UTF-8 → s'ouvre dans Excel.
 *
 * Les deux acceptent soit une journée (avec récit), soit une plage de dates.
 */
import { jsPDF } from 'jspdf';

export interface TimelineEvent {
  occurred_at: string;
  category: 'status_change' | 'document' | 'alert' | 'decision';
  actor: 'user' | 'agent' | 'system';
  label: string;
  detail: string | null;
}

export interface JournalExportInput {
  chantierNom: string;
  periodLabel: string;        // ex: "17 mai 2026" ou "du 1 au 17 mai 2026"
  digest?: string | null;     // récit (uniquement pour une journée unique)
  events: TimelineEvent[];
}

const CAT_LABEL: Record<string, string> = {
  status_change: 'Statut',
  document: 'Document',
  alert: 'Alerte',
  decision: 'Décision IA',
};

const ACTOR_LABEL: Record<string, string> = {
  user: 'Vous',
  agent: 'Assistant IA',
  system: 'Système',
};

function slug(s: string): string {
  // NFD décompose les accents (é → e + diacritique) ; le `[^a-z0-9]+` retire
  // ensuite les diacritiques combinants en même temps que la ponctuation.
  return s.toLowerCase().normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'chantier';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── CSV ─────────────────────────────────────────────────────────────────────

function csvCell(v: string): string {
  return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export function exportTimelineCSV(input: JournalExportInput): void {
  const rows: string[][] = [['Date', 'Heure', 'Catégorie', 'Acteur', 'Événement', 'Détail']];
  for (const e of input.events) {
    rows.push([
      fmtDate(e.occurred_at),
      fmtTime(e.occurred_at),
      CAT_LABEL[e.category] ?? e.category,
      ACTOR_LABEL[e.actor] ?? e.actor,
      e.label,
      e.detail ?? '',
    ]);
  }
  // BOM UTF-8 + séparateur `;` (convention Excel FR), fins de ligne CRLF.
  const csv = '﻿' + rows.map(r => r.map(c => csvCell(String(c))).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `journal-${slug(input.chantierNom)}-${slug(input.periodLabel)}.csv`);
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/**
 * jsPDF (polices standard) encode en WinAnsi : les caractères hors Latin-1
 * (flèche →, emoji, puces…) s'affichent en charabia. On les remplace/retire.
 */
function pdfSafe(s: string): string {
  return s
    .replace(/→/g, '->')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/[^\x00-\xFF]/g, '') // retire emoji & symboles hors Latin-1
    .trim();
}

function stripMarkdown(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*>\s+/gm, '');
}

export function exportTimelinePDF(input: JournalExportInput): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > pageH - margin) { doc.addPage(); y = margin; }
  };

  // En-tête
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20);
  doc.text('Journal de chantier', margin, y); y += 8;
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(40);
  doc.text(pdfSafe(input.chantierNom), margin, y); y += 6;
  doc.setFontSize(10).setTextColor(120);
  doc.text(pdfSafe(input.periodLabel), margin, y); y += 4;
  doc.setDrawColor(220); doc.line(margin, y, pageW - margin, y); y += 8;

  // Récit du jour
  if (input.digest && input.digest.trim()) {
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(20);
    ensure(8); doc.text('Recit du jour', margin, y); y += 6;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(50);
    const lines = doc.splitTextToSize(pdfSafe(stripMarkdown(input.digest)), contentW);
    for (const line of lines) { ensure(5); doc.text(line, margin, y); y += 5; }
    y += 8;
  }

  // Timeline
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(20);
  ensure(8); doc.text('Timeline horodatee', margin, y); y += 6;

  if (input.events.length === 0) {
    doc.setFont('helvetica', 'italic').setFontSize(10).setTextColor(130);
    ensure(5); doc.text('Aucun evenement sur cette periode.', margin, y); y += 5;
  }

  for (const e of input.events) {
    const head = `[${fmtDate(e.occurred_at)} ${fmtTime(e.occurred_at)}]  ${CAT_LABEL[e.category] ?? e.category} - ${e.label}`;
    const headLines = doc.splitTextToSize(pdfSafe(head), contentW);
    ensure(headLines.length * 4.6 + (e.detail ? 5 : 0) + 3);
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(30);
    doc.text(headLines, margin, y); y += headLines.length * 4.6;
    if (e.detail) {
      doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(120);
      const detLines = doc.splitTextToSize(pdfSafe(e.detail), contentW - 5);
      ensure(detLines.length * 4);
      doc.text(detLines, margin + 5, y); y += detLines.length * 4;
    }
    y += 3;
  }

  // Pied de page : pagination
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(160);
    doc.text(`GérerMonChantier — page ${p}/${total}`, pageW / 2, pageH - 8, { align: 'center' });
  }

  doc.save(`journal-${slug(input.chantierNom)}-${slug(input.periodLabel)}.pdf`);
}
