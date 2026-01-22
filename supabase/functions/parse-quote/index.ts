import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============ TYPE DEFINITIONS ============

interface ParsedQuote {
  totals: {
    ht: number | null;
    tva: number | null;
    ttc: number | null;
  };
  payments: {
    methods: string[];
    deposit_pct: number | null;
    iban: string | null;
  };
  lines: ParsedLine[];
  work_categories: WorkCategory[];
  qty_ref: number | null;       // Surface/quantité de référence max détectée
  qty_unit: string | null;      // m², ml, unité, forfait
  parsing_warnings: string[];   // Alertes de parsing
}

interface ParsedLine {
  label: string;
  qty: number | null;           // JAMAIS de valeur par défaut si non trouvée
  unit: string | null;          // m², ml, unité, forfait, h, jour
  unit_price_ht: number | null;
  total_ht: number | null;
}

interface WorkCategory {
  category_key: string;
  lines: ParsedLine[];
  total_ht: number;
  max_qty: number | null;
  max_qty_unit: string | null;
}

// ============ HELPER: UNIT DETECTION ============

const UNIT_PATTERNS: Record<string, RegExp[]> = {
  "m²": [/(\d+[\s,.]?\d*)\s*m²/gi, /(\d+[\s,.]?\d*)\s*m2/gi, /(\d+[\s,.]?\d*)\s*mètres?\s*carrés?/gi],
  "ml": [/(\d+[\s,.]?\d*)\s*ml/gi, /(\d+[\s,.]?\d*)\s*m\.?l\.?/gi, /(\d+[\s,.]?\d*)\s*mètres?\s*linéaires?/gi],
  "unité": [/(\d+[\s,.]?\d*)\s*(?:u|unité|pièce|pce)/gi],
  "forfait": [/forfait/gi, /ens(?:emble)?/gi],
  "h": [/(\d+[\s,.]?\d*)\s*(?:h|heure)/gi],
  "jour": [/(\d+[\s,.]?\d*)\s*(?:j|jour)/gi],
};

function detectUnit(text: string): { unit: string | null; qty: number | null } {
  const normalizedText = text.toLowerCase();
  
  for (const [unit, patterns] of Object.entries(UNIT_PATTERNS)) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0; // Reset regex state
      const match = pattern.exec(normalizedText);
      if (match) {
        if (unit === "forfait") {
          return { unit: "forfait", qty: 1 };
        }
        const qtyStr = match[1];
        if (qtyStr) {
          const qty = parseFloat(qtyStr.replace(/\s/g, '').replace(',', '.'));
          if (!isNaN(qty) && qty > 0) {
            return { unit, qty };
          }
        }
      }
    }
  }
  
  return { unit: null, qty: null };
}

// ============ HELPER: PRICE EXTRACTION ============

const PRICE_PATTERNS = [
  // Format: 1 234,56 € or 1234.56€
  /(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})\s*€/g,
  // Format: €1234.56
  /€\s*(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})/g,
  // Format with EUR
  /(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})\s*EUR/gi,
];

function extractPrice(text: string): number | null {
  for (const pattern of PRICE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const priceStr = match[1].replace(/[\s\u00a0]/g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }
  }
  return null;
}

// ============ HELPER: TOTALS EXTRACTION ============

function extractTotals(text: string): { ht: number | null; tva: number | null; ttc: number | null } {
  const lines = text.split('\n');
  let ht: number | null = null;
  let tva: number | null = null;
  let ttc: number | null = null;
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Total TTC (check first as it's more specific)
    if (/total\s*(?:général\s*)?ttc|ttc\s*:?|net\s*à\s*payer/i.test(line)) {
      const price = extractPrice(line);
      if (price) ttc = price;
    }
    // Total HT
    else if (/total\s*(?:général\s*)?ht|ht\s*:|montant\s*ht/i.test(line)) {
      const price = extractPrice(line);
      if (price) ht = price;
    }
    // TVA
    else if (/tva\s*(?:\d+\s*%)?|montant\s*tva/i.test(line)) {
      const price = extractPrice(line);
      if (price) tva = price;
    }
  }
  
  // Infer missing values if possible
  if (ht && tva && !ttc) {
    ttc = ht + tva;
  } else if (ht && ttc && !tva) {
    tva = ttc - ht;
  } else if (tva && ttc && !ht) {
    ht = ttc - tva;
  }
  
  return { ht, tva, ttc };
}

// ============ HELPER: PAYMENT EXTRACTION ============

function extractPayments(text: string): { methods: string[]; deposit_pct: number | null; iban: string | null } {
  const methods: string[] = [];
  let deposit_pct: number | null = null;
  let iban: string | null = null;
  
  const lowerText = text.toLowerCase();
  
  // Payment methods
  if (/chèque|cheque/i.test(text)) methods.push("chèque");
  if (/espèces|espece/i.test(text)) methods.push("espèces");
  if (/virement/i.test(text)) methods.push("virement");
  if (/carte\s*(?:bancaire)?|cb/i.test(text)) methods.push("carte bancaire");
  
  // Deposit percentage
  const depositMatch = /acompte\s*(?:de\s*)?(\d+)\s*%/i.exec(text);
  if (depositMatch) {
    deposit_pct = parseInt(depositMatch[1], 10);
  }
  
  // IBAN
  const ibanMatch = /([A-Z]{2}\d{2}(?:\s?\d{4}){5,6})/i.exec(text);
  if (ibanMatch) {
    iban = ibanMatch[1].replace(/\s/g, '').toUpperCase();
  }
  
  return { methods, deposit_pct, iban };
}

// ============ HELPER: LINE PARSING ============

function parseLines(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  const textLines = text.split('\n');
  
  // Look for patterns that look like quote lines
  // Typical format: Description [qty] [unit] [unit price] [total]
  
  for (const textLine of textLines) {
    // Skip empty lines and headers
    if (!textLine.trim() || textLine.trim().length < 10) continue;
    if (/^(?:désignation|description|libellé|quantité|prix|total|ht|ttc)/i.test(textLine.trim())) continue;
    
    // Check if line has a price
    const price = extractPrice(textLine);
    if (!price) continue;
    
    // Detect unit and quantity
    const { unit, qty } = detectUnit(textLine);
    
    // Extract label (text before the first number usually)
    let label = textLine
      .replace(/(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})\s*€?/g, '') // Remove prices
      .replace(/\d+[\s,.]?\d*\s*(?:m²|m2|ml|u|unité|forfait|h|heure|j|jour)/gi, '') // Remove qty+unit
      .trim();
    
    // Clean up label
    label = label.replace(/^\s*[-–•]\s*/, '').trim();
    
    if (label.length < 3) continue;
    
    // RÈGLE STRICTE: qty = null si non détecté (jamais de valeur par défaut)
    const parsedLine: ParsedLine = {
      label,
      qty: qty,  // null si non détecté
      unit: unit,
      unit_price_ht: (qty && price && qty > 0) ? price / qty : null,
      total_ht: price,
    };
    
    lines.push(parsedLine);
  }
  
  return lines;
}

// ============ HELPER: FIND MAX QUANTITY ============

function findMaxQuantity(lines: ParsedLine[], targetUnit: string): { qty: number | null; unit: string | null } {
  let maxQty: number | null = null;
  let maxUnit: string | null = null;
  
  for (const line of lines) {
    if (line.unit === targetUnit && line.qty !== null) {
      if (maxQty === null || line.qty > maxQty) {
        maxQty = line.qty;
        maxUnit = line.unit;
      }
    }
  }
  
  return { qty: maxQty, unit: maxUnit };
}

// ============ MAIN PARSER ============

function parseQuote(rawText: string, blocks?: any[]): ParsedQuote {
  const warnings: string[] = [];
  
  // Use raw text directly (blocks would be used for more precise extraction)
  const text = rawText;
  
  // Extract totals
  const totals = extractTotals(text);
  if (!totals.ht && !totals.ttc) {
    warnings.push("Aucun montant total (HT ou TTC) n'a été détecté.");
  }
  
  // Extract payments
  const payments = extractPayments(text);
  
  // Parse lines
  const lines = parseLines(text);
  if (lines.length === 0) {
    warnings.push("Aucune ligne de devis détaillée n'a pu être extraite.");
  }
  
  // Count lines with missing quantities
  const linesWithoutQty = lines.filter(l => l.qty === null);
  if (linesWithoutQty.length > 0) {
    warnings.push(`${linesWithoutQty.length} ligne(s) sans quantité détectée.`);
  }
  
  // Find max quantity for m² (used for price comparison)
  const maxM2 = findMaxQuantity(lines, "m²");
  const maxMl = findMaxQuantity(lines, "ml");
  
  // Choose the most relevant reference quantity
  let qty_ref: number | null = null;
  let qty_unit: string | null = null;
  
  if (maxM2.qty !== null && maxM2.qty > 1) {
    qty_ref = maxM2.qty;
    qty_unit = "m²";
  } else if (maxMl.qty !== null && maxMl.qty > 1) {
    qty_ref = maxMl.qty;
    qty_unit = "ml";
  }
  
  // RÈGLE: si qty_ref <= 1, on considère qu'il n'y a pas de surface fiable
  if (qty_ref !== null && qty_ref <= 1) {
    warnings.push("Surface/quantité de référence détectée <= 1. Considérée comme non fiable.");
    qty_ref = null;
    qty_unit = null;
  }
  
  return {
    totals,
    payments,
    lines,
    work_categories: [], // Will be populated when user selects categories
    qty_ref,
    qty_unit,
    parsing_warnings: warnings,
  };
}

// ============ MAIN HANDLER ============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { analysis_id, raw_text, blocks } = body;

    if (!analysis_id || !raw_text) {
      return new Response(
        JSON.stringify({ error: "Missing analysis_id or raw_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("=== PARSE-QUOTE START ===");
    console.log("Analysis ID:", analysis_id);
    console.log("Text length:", raw_text.length);

    // Parse the quote
    const parsed = parseQuote(raw_text, blocks);

    console.log("Parsing complete:");
    console.log("- Totals HT:", parsed.totals.ht);
    console.log("- Lines found:", parsed.lines.length);
    console.log("- Qty ref:", parsed.qty_ref, parsed.qty_unit);
    console.log("- Warnings:", parsed.parsing_warnings);

    // Update document_extractions with parsed data
    const { error: updateError } = await supabase
      .from("document_extractions")
      .update({
        parsed_data: parsed,
        qty_ref_detected: parsed.qty_ref,
        qty_unit: parsed.qty_unit,
      })
      .eq("analysis_id", analysis_id);

    if (updateError) {
      console.error("Failed to update document_extractions:", updateError);
    }

    console.log("=== PARSE-QUOTE COMPLETE ===");

    return new Response(
      JSON.stringify({
        success: true,
        data: parsed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
