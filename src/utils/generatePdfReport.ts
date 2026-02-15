import jsPDF from "jspdf";
import { getScoreLabel } from "@/lib/scoreUtils";
import { extractEntrepriseData, filterOutEntrepriseItems } from "@/lib/entrepriseUtils";
import { extractSecuriteData, filterOutSecuriteItems } from "@/lib/securiteUtils";
import { extractSiteContextFromPoints, filterOutContexteItems } from "@/lib/contexteUtils";

type Analysis = {
  id: string;
  file_name: string;
  score: string | null;
  resume: string | null;
  points_ok: string[];
  alertes: string[];
  recommandations: string[];
  status: string;
  error_message: string | null;
  created_at: string;
  raw_text?: string;
  site_context?: Record<string, unknown>;
  attestation_comparison?: Record<string, unknown>;
  assurance_level2_score?: string | null;
};

// ============================================================
// TEXT HELPERS
// ============================================================

const sanitizeText = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")
    .replace(/✓/g, "[OK]")
    .replace(/✔/g, "[OK]")
    .replace(/❌/g, "[X]")
    .replace(/⚠️?/g, "[!]")
    .replace(/ℹ️?/g, "[i]")
    .replace(/🟢/g, "[+]")
    .replace(/🟡/g, "[~]")
    .replace(/🔴/g, "[-]")
    .replace(/📋/g, "")
    .replace(/📊/g, "")
    .replace(/📍/g, "")
    .replace(/🏠/g, "")
    .replace(/💰/g, "")
    .replace(/🔒/g, "")
    .replace(/🛡️?/g, "")
    .replace(/📄/g, "")
    .replace(/📁/g, "")
    .replace(/✅/g, "[OK]")
    .replace(/❎/g, "[X]")
    .replace(/💡/g, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200B}-\u{200D}]/gu, "")
    .replace(/[\u{2028}-\u{202F}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const COLORS = {
  primary: [59, 130, 246] as [number, number, number],
  green: [34, 197, 94] as [number, number, number],
  orange: [249, 115, 22] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  darkText: [30, 30, 30] as [number, number, number],
  lightText: [100, 100, 100] as [number, number, number],
  bg: [245, 247, 250] as [number, number, number],
};

const getScoreColor = (score: string | null): [number, number, number] => {
  switch (score) {
    case "VERT": return COLORS.green;
    case "ORANGE": return COLORS.orange;
    case "ROUGE": return COLORS.red;
    default: return COLORS.gray;
  }
};

const getScoreSymbol = (score: string): string => {
  switch (score) {
    case "VERT": return "[+]";
    case "ORANGE": return "[~]";
    case "ROUGE": return "[-]";
    default: return "";
  }
};

// ============================================================
// PDF BUILDER CLASS (internal state management)
// ============================================================

class PdfBuilder {
  doc: jsPDF;
  margin = 20;
  y = 20;
  pageWidth: number;
  contentWidth: number;
  pageHeight: number;

  constructor() {
    this.doc = new jsPDF();
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.contentWidth = this.pageWidth - this.margin * 2;
    this.pageHeight = this.doc.internal.pageSize.getHeight();
  }

  checkPageBreak(needed: number) {
    if (this.y + needed > this.pageHeight - 20) {
      this.doc.addPage();
      this.y = 20;
    }
  }

  addWrappedText(text: string, x: number, maxWidth: number, lineHeight = 6): void {
    const clean = sanitizeText(text);
    const lines: string[] = this.doc.splitTextToSize(clean, maxWidth);
    for (const line of lines) {
      this.checkPageBreak(lineHeight);
      this.doc.text(line, x, this.y);
      this.y += lineHeight;
    }
  }

  addBulletPoint(text: string, color: [number, number, number], indent = 8): void {
    this.checkPageBreak(8);
    this.doc.setFillColor(color[0], color[1], color[2]);
    this.doc.circle(this.margin + 2, this.y - 1.5, 1.5, "F");
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...COLORS.darkText);
    this.addWrappedText(text, this.margin + indent, this.contentWidth - indent, 5);
    this.y += 1;
  }

  addBlockHeader(title: string, score?: string | null): void {
    this.checkPageBreak(20);
    this.y += 4;

    // Block background band
    const scoreColor = score ? getScoreColor(score) : COLORS.primary;
    this.doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
    this.doc.roundedRect(this.margin, this.y - 5, this.contentWidth, 12, 2, 2, "F");

    this.doc.setTextColor(255, 255, 255);
    this.doc.setFontSize(11);
    this.doc.setFont("helvetica", "bold");
    this.doc.text(title, this.margin + 5, this.y + 3);

    if (score) {
      const label = getScoreSymbol(score) + " " + score;
      const labelWidth = this.doc.getTextWidth(label);
      this.doc.text(label, this.pageWidth - this.margin - 5 - labelWidth, this.y + 3);
    }

    this.y += 12;
  }

  addKeyValue(key: string, value: string | null | undefined): void {
    if (!value) return;
    this.checkPageBreak(7);
    this.doc.setFontSize(9);
    this.doc.setFont("helvetica", "bold");
    this.doc.setTextColor(...COLORS.darkText);
    this.doc.text(key + " : ", this.margin + 4, this.y);
    const keyWidth = this.doc.getTextWidth(key + " : ");
    this.doc.setFont("helvetica", "normal");
    this.doc.text(sanitizeText(value), this.margin + 4 + keyWidth, this.y);
    this.y += 6;
  }

  addSeparator(): void {
    this.y += 3;
    this.doc.setDrawColor(220, 220, 220);
    this.doc.line(this.margin, this.y, this.pageWidth - this.margin, this.y);
    this.y += 5;
  }
}

// ============================================================
// MAIN EXPORT
// ============================================================

export const generatePdfReport = (analysis: Analysis) => {
  const pdf = new PdfBuilder();
  const { doc } = pdf;

  const pointsOk = analysis.points_ok || [];
  const alertes = analysis.alertes || [];

  // ============ HEADER ============
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pdf.pageWidth, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("VerifierMonDevis.fr", pdf.margin, 24);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Rapport d'analyse de devis", pdf.margin, 33);
  pdf.y = 50;

  // ============ SCORE BADGE ============
  const scoreColor = getScoreColor(analysis.score);
  doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.roundedRect(pdf.margin, pdf.y, pdf.contentWidth, 22, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(getScoreLabel(analysis.score), pdf.margin + 10, pdf.y + 14);
  pdf.y += 30;

  // ============ FILE INFO ============
  doc.setTextColor(...COLORS.lightText);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Fichier : " + sanitizeText(analysis.file_name), pdf.margin, pdf.y);
  pdf.y += 5;
  doc.text("Date : " + new Date(analysis.created_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
  }), pdf.margin, pdf.y);
  pdf.y += 5;
  doc.text("ID : " + analysis.id, pdf.margin, pdf.y);
  pdf.y += 8;

  // ============ RESUME ============
  if (analysis.resume) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...COLORS.darkText);
    pdf.addWrappedText(analysis.resume, pdf.margin, pdf.contentWidth, 5);
    pdf.y += 4;
  }

  pdf.addSeparator();

  // ============================================================
  // BLOC 1 — ENTREPRISE & FIABILITE
  // ============================================================
  const entrepriseData = extractEntrepriseData(pointsOk, alertes);
  pdf.addBlockHeader("ENTREPRISE & FIABILITE", entrepriseData.score);

  // Structured company data from raw_text
  let companyName: string | null = null;
  let companySiret: string | null = null;
  let companyAddress: string | null = null;
  let companyAge: string | null = null;

  if (analysis.raw_text) {
    try {
      const parsed = JSON.parse(analysis.raw_text);
      const extracted = parsed?.extracted;
      const verified = parsed?.verified;
      companyName = verified?.nom_officiel || extracted?.entreprise?.nom || null;
      companySiret = extracted?.entreprise?.siret || null;
      companyAddress = verified?.adresse_officielle
        ? `${verified.adresse_officielle}${verified.ville_officielle ? ", " + verified.ville_officielle : ""}`
        : null;
      if (verified?.anciennete_annees != null) {
        companyAge = `${verified.anciennete_annees} ans`;
      }
    } catch { /* ignore */ }
  }

  pdf.addKeyValue("Entreprise", companyName);
  pdf.addKeyValue("SIRET", companySiret);
  pdf.addKeyValue("Adresse", companyAddress);
  pdf.addKeyValue("Anciennete", companyAge || entrepriseData.anciennete);
  pdf.addKeyValue("Chiffre d'affaires", entrepriseData.chiffreAffaires);
  pdf.addKeyValue("Resultat net", entrepriseData.resultatNet);
  pdf.addKeyValue("Autonomie financiere", entrepriseData.autonomieFinanciere);
  pdf.addKeyValue("Taux d'endettement", entrepriseData.tauxEndettement);
  pdf.addKeyValue("Ratio de liquidite", entrepriseData.ratioLiquidite);

  if (entrepriseData.procedureCollective === true) {
    pdf.addKeyValue("Procedure collective", "OUI - En cours");
  } else if (entrepriseData.procedureCollective === false) {
    pdf.addKeyValue("Procedure collective", "Aucune");
  }

  if (entrepriseData.reputation) {
    const rep = entrepriseData.reputation;
    if (rep.status === "found" && rep.rating) {
      pdf.addKeyValue("Reputation Google", `${rep.rating}/5 (${rep.reviews_count || "?"} avis)`);
    } else if (rep.status === "not_found") {
      pdf.addKeyValue("Reputation Google", "Aucun avis trouve");
    }
  }

  // Entreprise-specific points that weren't captured in structured data
  const entreprisePointsOk = pointsOk.filter(p => !filterOutEntrepriseItems([p]).length);
  const entrepriseAlertes = alertes.filter(a => !filterOutEntrepriseItems([a]).length);

  // Show remaining RGE/QUALIBAT or other enterprise items as bullets
  const entrepriseExtras = [...entreprisePointsOk, ...entrepriseAlertes].filter(p => {
    const l = p.toLowerCase();
    return l.includes("rge") || l.includes("qualibat");
  });
  for (const item of entrepriseExtras) {
    const isAlerte = alertes.includes(item);
    pdf.addBulletPoint(item, isAlerte ? COLORS.orange : COLORS.green);
  }

  pdf.y += 4;

  // ============================================================
  // BLOC 2 — ANALYSE PRIX & COHERENCE MARCHE
  // ============================================================
  let priceData: Array<{
    job_type_label: string;
    devis_total_ht: number | null;
    main_quantity: number;
    main_unit: string;
    devis_lines: Array<{ description: string; amount_ht: number | null }>;
    prices: Array<{
      price_min_unit_ht: number;
      price_avg_unit_ht: number;
      price_max_unit_ht: number;
      fixed_min_ht: number;
      fixed_avg_ht: number;
      fixed_max_ht: number;
    }>;
  }> = [];

  if (analysis.raw_text) {
    try {
      const parsed = JSON.parse(analysis.raw_text);
      if (Array.isArray(parsed?.n8n_price_data)) {
        priceData = parsed.n8n_price_data;
      }
    } catch { /* ignore */ }
  }

  if (priceData.length > 0) {
    pdf.addBlockHeader("ANALYSE PRIX & COHERENCE MARCHE");

    for (const jt of priceData) {
      pdf.checkPageBreak(18);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.darkText);
      doc.text(sanitizeText(jt.job_type_label), pdf.margin + 4, pdf.y);
      pdf.y += 5;

      // Show devis lines
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.lightText);
      for (const line of jt.devis_lines.slice(0, 5)) {
        pdf.checkPageBreak(5);
        const desc = sanitizeText(line.description).substring(0, 70);
        const amount = line.amount_ht !== null ? ` — ${line.amount_ht.toLocaleString("fr-FR")} EUR HT` : "";
        doc.text("  - " + desc + amount, pdf.margin + 6, pdf.y);
        pdf.y += 4;
      }
      if (jt.devis_lines.length > 5) {
        doc.text(`  ... et ${jt.devis_lines.length - 5} autre(s) poste(s)`, pdf.margin + 6, pdf.y);
        pdf.y += 4;
      }

      // Show total and market range
      if (jt.devis_total_ht !== null) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.darkText);
        doc.text(`  Total devis : ${jt.devis_total_ht.toLocaleString("fr-FR")} EUR HT`, pdf.margin + 6, pdf.y);
        pdf.y += 5;
      }

      if (jt.prices.length > 0 && jt.main_quantity > 0) {
        const p = jt.prices[0];
        const minHT = p.price_min_unit_ht * jt.main_quantity + p.fixed_min_ht;
        const avgHT = p.price_avg_unit_ht * jt.main_quantity + p.fixed_avg_ht;
        const maxHT = p.price_max_unit_ht * jt.main_quantity + p.fixed_max_ht;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.lightText);
        doc.text(
          `  Fourchette marche : ${Math.round(minHT).toLocaleString("fr-FR")} - ${Math.round(maxHT).toLocaleString("fr-FR")} EUR HT (moy. ${Math.round(avgHT).toLocaleString("fr-FR")})`,
          pdf.margin + 6, pdf.y
        );
        pdf.y += 5;

        // Verdict
        if (jt.devis_total_ht !== null) {
          let verdict: string;
          let verdictColor: [number, number, number];
          const ratio = jt.devis_total_ht / avgHT;
          if (ratio <= 0.85) {
            verdict = "Inferieur a la moyenne du marche";
            verdictColor = COLORS.green;
          } else if (ratio <= 1.15) {
            verdict = "Dans la norme du marche";
            verdictColor = COLORS.green;
          } else if (ratio <= 1.40) {
            verdict = "Legerement au-dessus du marche";
            verdictColor = COLORS.orange;
          } else {
            verdict = "Significativement au-dessus du marche";
            verdictColor = COLORS.red;
          }
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(verdictColor[0], verdictColor[1], verdictColor[2]);
          doc.text("  -> " + verdict, pdf.margin + 6, pdf.y);
          pdf.y += 6;
        }
      }

      pdf.y += 2;
    }
    pdf.y += 2;
  }

  // ============================================================
  // BLOC 3 — SECURITE & CONDITIONS DE PAIEMENT
  // ============================================================
  const securiteData = extractSecuriteData(
    pointsOk,
    alertes,
    analysis.attestation_comparison as any,
    analysis.assurance_level2_score
  );
  pdf.addBlockHeader("SECURITE & CONDITIONS DE PAIEMENT", securiteData.globalScore);

  // Assurances
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.darkText);
  doc.text("Assurances", pdf.margin + 4, pdf.y);
  pdf.y += 6;

  const decLabel = securiteData.decennale.mentionnee ? "Mentionnee sur le devis" :
    securiteData.decennale.attestationStatus === "verified" ? "Verifiee par attestation" : "Non detectee";
  pdf.addKeyValue("  Garantie decennale", `${decLabel} ${getScoreSymbol(securiteData.decennale.score)}`);

  const rcLabel = securiteData.rcpro.mentionnee ? "Mentionnee sur le devis" :
    securiteData.rcpro.attestationStatus === "verified" ? "Verifiee par attestation" : "Non detectee";
  pdf.addKeyValue("  RC Professionnelle", `${rcLabel} ${getScoreSymbol(securiteData.rcpro.score)}`);

  pdf.y += 2;

  // Payment conditions
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.darkText);
  doc.text("Conditions de paiement", pdf.margin + 4, pdf.y);
  pdf.y += 6;

  if (securiteData.paiement.modes.length > 0) {
    pdf.addKeyValue("  Modes de paiement", securiteData.paiement.modes.join(", "));
  }
  if (securiteData.paiement.acomptePourcentage !== null) {
    pdf.addKeyValue("  Acompte demande", `${securiteData.paiement.acomptePourcentage}%`);
  }
  if (securiteData.paiement.ibanValid !== null) {
    const ibanLabel = securiteData.paiement.ibanValid
      ? (securiteData.paiement.ibanFrance ? "Valide (France)" : `Valide (${securiteData.paiement.ibanCountry || "etranger"})`)
      : "Non valide";
    pdf.addKeyValue("  IBAN", ibanLabel);
  }

  // Vigilance reasons
  if (securiteData.vigilanceReasons.length > 0) {
    pdf.y += 2;
    for (const reason of securiteData.vigilanceReasons) {
      pdf.addBulletPoint(reason, COLORS.orange);
    }
  }

  // Securite recommendations
  if (securiteData.recommendations.length > 0) {
    for (const rec of securiteData.recommendations) {
      pdf.addBulletPoint(rec, COLORS.primary);
    }
  }

  pdf.y += 4;

  // ============================================================
  // BLOC 4 — CONTEXTE DU CHANTIER
  // ============================================================
  const siteContext = analysis.site_context
    ? analysis.site_context as any
    : extractSiteContextFromPoints(pointsOk, alertes);

  if (siteContext && siteContext.status !== "not_searched") {
    pdf.addBlockHeader("CONTEXTE DU CHANTIER");

    if (siteContext.address || siteContext.postal_code) {
      pdf.addKeyValue("Zone analysee", siteContext.address || `Code postal ${siteContext.postal_code}`);
    }

    if (siteContext.status === "data_found") {
      if (siteContext.risks && siteContext.risks.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.darkText);
        pdf.checkPageBreak(8);
        doc.text(`Risques naturels identifies (${siteContext.risks.length})`, pdf.margin + 4, pdf.y);
        pdf.y += 6;
        for (const risk of siteContext.risks) {
          pdf.addBulletPoint(`${risk.risk_type} — ${risk.level}`, COLORS.orange);
        }
      }

      if (siteContext.seismic_zone) {
        pdf.addKeyValue("Zone sismique", `${siteContext.seismic_zone.zone} (${siteContext.seismic_zone.level})`);
      }

      if (siteContext.patrimoine) {
        if (siteContext.patrimoine.status === "possible") {
          const types = siteContext.patrimoine.types?.length > 0 ? ` (${siteContext.patrimoine.types.join(", ")})` : "";
          pdf.addBulletPoint(`Patrimoine / ABF : zone de protection patrimoniale detectee${types}`, COLORS.orange);
        } else if (siteContext.patrimoine.status === "non_detecte") {
          pdf.addBulletPoint("Patrimoine / ABF : aucune zone patrimoniale detectee", COLORS.green);
        }
      }
    } else if (siteContext.status === "no_data") {
      pdf.addBulletPoint("Aucune contrainte particuliere identifiee", COLORS.green);
    } else if (siteContext.status === "address_incomplete") {
      pdf.addBulletPoint("Adresse du chantier non exploitable pour la verification", COLORS.orange);
    }

    pdf.y += 4;
  }

  // ============================================================
  // RECOMMANDATIONS GENERALES
  // ============================================================
  if (analysis.recommandations && analysis.recommandations.length > 0) {
    pdf.addBlockHeader("RECOMMANDATIONS");

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.darkText);

    for (let i = 0; i < analysis.recommandations.length; i++) {
      pdf.checkPageBreak(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}.`, pdf.margin + 4, pdf.y);
      doc.setFont("helvetica", "normal");
      pdf.addWrappedText(analysis.recommandations[i], pdf.margin + 12, pdf.contentWidth - 12, 5);
      pdf.y += 2;
    }
    pdf.y += 4;
  }

  // ============================================================
  // REMAINING ITEMS (not captured by any block)
  // ============================================================
  let remainingOk = filterOutEntrepriseItems(pointsOk);
  remainingOk = filterOutSecuriteItems(remainingOk);
  remainingOk = filterOutContexteItems(remainingOk);

  let remainingAlertes = filterOutEntrepriseItems(alertes);
  remainingAlertes = filterOutSecuriteItems(remainingAlertes);
  remainingAlertes = filterOutContexteItems(remainingAlertes);

  if (remainingOk.length > 0 || remainingAlertes.length > 0) {
    pdf.addBlockHeader("AUTRES VERIFICATIONS");

    for (const item of remainingOk) {
      pdf.addBulletPoint(item, COLORS.green);
    }
    for (const item of remainingAlertes) {
      pdf.addBulletPoint(item, COLORS.orange);
    }
    pdf.y += 4;
  }

  // ============================================================
  // FOOTER
  // ============================================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200);
    doc.line(pdf.margin, pdf.pageHeight - 15, pdf.pageWidth - pdf.margin, pdf.pageHeight - 15);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Ce rapport est fourni a titre informatif et ne constitue pas un conseil juridique. — VerifierMonDevis.fr",
      pdf.margin,
      pdf.pageHeight - 10
    );
    doc.text(
      `Page ${i}/${totalPages}`,
      pdf.pageWidth - pdf.margin - 20,
      pdf.pageHeight - 10
    );
  }

  // ============ DOWNLOAD ============
  const safeFileName = sanitizeText(analysis.file_name).replace(/[^a-zA-Z0-9-_]/g, "_");
  const fileName = "rapport-analyse-" + safeFileName.replace(/\.[^/.]+$/, "") + "-" + new Date().toISOString().split("T")[0] + ".pdf";
  doc.save(fileName);
};
