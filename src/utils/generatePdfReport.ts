import jsPDF from "jspdf";
import { getScoreLabel } from "@/lib/scoreUtils";

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
};

// Fonction pour nettoyer le texte des emojis et caractères spéciaux
const sanitizeText = (text: string): string => {
  if (!text) return "";
  
  // Supprimer tous les emojis et caractères spéciaux Unicode
  return text
    // Supprimer les emojis courants
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")
    // Remplacer les symboles courants par du texte
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
    // Supprimer les caractères de contrôle et autres symboles problématiques
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "") // Variation selectors
    .replace(/[\u{200B}-\u{200D}]/gu, "") // Zero-width characters
    .replace(/[\u{2028}-\u{202F}]/gu, " ") // Line/paragraph separators
    // Nettoyer les espaces multiples
    .replace(/\s+/g, " ")
    .trim();
};

const getScoreColor = (score: string | null): [number, number, number] => {
  switch (score) {
    case "VERT": return [34, 197, 94];
    case "ORANGE": return [249, 115, 22];
    case "ROUGE": return [239, 68, 68];
    default: return [107, 114, 128];
  }
};

export const generatePdfReport = (analysis: Analysis) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let yPos = 20;

  // Helper function to add wrapped text
  const addWrappedText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number = 6): number => {
    const cleanText = sanitizeText(text);
    const lines = doc.splitTextToSize(cleanText, maxWidth);
    lines.forEach((line: string, index: number) => {
      if (y + (index * lineHeight) > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, x, y + (index * lineHeight));
    });
    return y + (lines.length * lineHeight);
  };

  // Header
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, pageWidth, 40, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("VerifierMonDevis.fr", margin, 25);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Rapport d'analyse de devis", margin, 33);
  
  yPos = 55;

  // Score Section
  const scoreColor = getScoreColor(analysis.score);
  doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.roundedRect(margin, yPos, contentWidth, 25, 3, 3, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(getScoreLabel(analysis.score), margin + 10, yPos + 16);
  
  yPos += 35;

  // File Info
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Fichier analyse: " + sanitizeText(analysis.file_name), margin, yPos);
  yPos += 6;
  doc.text("Date d'analyse: " + new Date(analysis.created_at).toLocaleDateString("fr-FR", { 
    day: "numeric", 
    month: "long", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }), margin, yPos);
  yPos += 6;
  doc.text("Identifiant: " + analysis.id, margin, yPos);
  
  yPos += 15;

  // Separator
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Resume Section
  if (analysis.resume) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(59, 130, 246);
    doc.text("RESUME DE L'ANALYSE", margin, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    yPos = addWrappedText(analysis.resume, margin, yPos, contentWidth);
    yPos += 10;
  }

  // Points OK Section
  if (analysis.points_ok && analysis.points_ok.length > 0) {
    if (yPos > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(34, 197, 94);
    doc.text("POINTS CONFORMES", margin, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    
    analysis.points_ok.forEach((point) => {
      if (yPos > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFillColor(34, 197, 94);
      doc.circle(margin + 2, yPos - 1.5, 1.5, "F");
      yPos = addWrappedText(point, margin + 8, yPos, contentWidth - 8);
      yPos += 2;
    });
    yPos += 8;
  }

  // Alertes Section
  if (analysis.alertes && analysis.alertes.length > 0) {
    if (yPos > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(249, 115, 22);
    doc.text("POINTS DE VIGILANCE", margin, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    
    analysis.alertes.forEach((alerte) => {
      if (yPos > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFillColor(249, 115, 22);
      doc.circle(margin + 2, yPos - 1.5, 1.5, "F");
      yPos = addWrappedText(alerte, margin + 8, yPos, contentWidth - 8);
      yPos += 2;
    });
    yPos += 8;
  }

  // Recommandations Section
  if (analysis.recommandations && analysis.recommandations.length > 0) {
    if (yPos > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(59, 130, 246);
    doc.text("RECOMMANDATIONS", margin, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    
    analysis.recommandations.forEach((rec, index) => {
      if (yPos > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text((index + 1) + ".", margin, yPos);
      doc.setFont("helvetica", "normal");
      yPos = addWrappedText(rec, margin + 8, yPos, contentWidth - 8);
      yPos += 4;
    });
    yPos += 8;
  }

  // Verifications Section
  if (yPos > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(107, 114, 128);
  doc.text("VERIFICATIONS EFFECTUEES", margin, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  
  const verifications = [
    "- Analyse IA du contenu du devis (mentions legales, conformite)",
    "- Verification Pappers : anciennete de l'entreprise, bilans disponibles, capitaux propres",
    "- Verification BODACC : procedures collectives (liquidation, redressement judiciaire)"
  ];
  
  verifications.forEach((v) => {
    if (yPos > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      yPos = 20;
    }
    yPos = addWrappedText(v, margin, yPos, contentWidth);
    yPos += 2;
  });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, doc.internal.pageSize.getHeight() - 15, pageWidth - margin, doc.internal.pageSize.getHeight() - 15);
    
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Ce rapport est fourni a titre informatif et ne constitue pas un conseil juridique.",
      margin,
      doc.internal.pageSize.getHeight() - 10
    );
    doc.text(
      "Page " + i + "/" + totalPages,
      pageWidth - margin - 20,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  // Download
  const safeFileName = sanitizeText(analysis.file_name).replace(/[^a-zA-Z0-9-_]/g, "_");
  const fileName = "rapport-analyse-" + safeFileName.replace(/\.[^/.]+$/, "") + "-" + new Date().toISOString().split("T")[0] + ".pdf";
  doc.save(fileName);
};
