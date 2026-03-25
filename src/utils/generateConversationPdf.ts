import jsPDF from "jspdf";

interface PdfMessage {
  direction: "outbound" | "inbound";
  subject: string | null;
  body_text: string;
  created_at: string;
}

interface PdfConversation {
  contact_name: string;
  contact_email: string;
}

const BLUE = [37, 99, 235];
const GRAY = [107, 114, 128];
const LIGHT_BLUE = [239, 246, 255];
const LIGHT_GRAY = [249, 250, 251];

function sanitize(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FEFF}]/gu, "")
    .replace(/\t/g, "    ")
    .trim();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateConversationPdf(
  conversation: PdfConversation,
  messages: PdfMessage[],
  chantierNom: string,
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPage = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = margin;
    }
  };

  const addWrapped = (text: string, x: number, maxW: number, lineH = 5): number => {
    const lines = doc.splitTextToSize(sanitize(text), maxW);
    for (const line of lines) {
      checkPage(lineH);
      doc.text(line, x, y);
      y += lineH;
    }
    return lines.length;
  };

  // ── Header ──────────────────────────────────────────────
  doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.rect(0, 0, pageWidth, 35, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("Conversation", margin, 15);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${conversation.contact_name} — ${conversation.contact_email}`, margin, 23);
  doc.text(`Chantier : ${sanitize(chantierNom)}`, margin, 30);

  y = 45;

  // ── Date range ──────────────────────────────────────────
  if (messages.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    const first = fmtDate(messages[0].created_at);
    const last = fmtDate(messages[messages.length - 1].created_at);
    doc.text(`${messages.length} message${messages.length > 1 ? "s" : ""} — du ${first} au ${last}`, margin, y);
    y += 10;
  }

  // ── Messages ────────────────────────────────────────────
  for (const msg of messages) {
    const isOut = msg.direction === "outbound";
    const bubbleX = isOut ? margin + contentWidth * 0.2 : margin;
    const bubbleW = contentWidth * 0.75;
    const textX = bubbleX + 4;
    const textW = bubbleW - 8;

    // Estimate height
    const bodyText = sanitize(msg.body_text || "");
    const bodyLines = doc.splitTextToSize(bodyText, textW);
    const subjectLines = msg.subject ? doc.splitTextToSize(sanitize(msg.subject), textW) : [];
    const totalLines = subjectLines.length + bodyLines.length;
    const bubbleH = totalLines * 4.5 + 14; // padding + timestamp

    checkPage(bubbleH + 6);

    // Bubble background
    const bg = isOut ? LIGHT_BLUE : LIGHT_GRAY;
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.roundedRect(bubbleX, y - 3, bubbleW, bubbleH, 3, 3, "F");

    // Sender label
    doc.setFontSize(7);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(isOut ? "Vous" : conversation.contact_name, textX, y + 3);
    y += 7;

    // Subject
    if (subjectLines.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      for (const line of subjectLines) {
        doc.text(line, textX, y);
        y += 4.5;
      }
    }

    // Body
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(50, 50, 50);
    for (const line of bodyLines) {
      doc.text(line, textX, y);
      y += 4.5;
    }

    // Timestamp
    y += 1;
    doc.setFontSize(7);
    doc.setTextColor(GRAY[0], GRAY[1], GRAY[2]);
    doc.text(fmtDate(msg.created_at), textX, y);
    y += 8;
  }

  // ── Footer ──────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(
      `VerifierMonDevis.fr — Page ${i}/${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" },
    );
  }

  // ── Download ────────────────────────────────────────────
  const safeName = conversation.contact_name.replace(/[^a-zA-Z0-9àâéèêëïîôùûüÿçÀÂÉÈÊËÏÎÔÙÛÜŸÇ\s-]/g, "").trim().replace(/\s+/g, "_");
  doc.save(`conversation_${safeName}.pdf`);
}
