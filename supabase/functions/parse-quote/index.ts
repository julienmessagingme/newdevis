import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parser version for tracking
const PARSER_VERSION = "3.0.0";

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
  qty_ref: number | null;
  qty_unit: string | null;
  parsing_warnings: string[];
}

interface ParsedLine {
  label: string;
  qty: number | null;
  unit: string | null;
  unit_normalized: string | null;
  unit_price_ht: number | null;
  total_ht: number | null;
  qty_raw?: string;
  unit_raw?: string;
  qty_source?: "column" | "textract_table" | "price_consistency" | "embedded_in_label";
  is_product: boolean;
  exclusion_reason?: string;
  line_index: number;
}

interface WorkCategory {
  category_key: string;
  lines: ParsedLine[];
  total_ht: number;
  max_qty: number | null;
  max_qty_unit: string | null;
}

// ============ DEBUG TYPES ============

interface ParserDebug {
  parser_version: string;
  line_items_count: number;
  line_items_with_qty_count: number;
  line_items_with_unit_count: number;
  product_lines_count: number;
  excluded_lines_count: number;
  detected_units_set: string[];
  qty_parse_errors: string[];
  sample_lines: SampleLine[];
  excluded_lines: ExcludedLine[];
  textract_tables_used: boolean;
}

interface SampleLine {
  raw_line: string;
  description: string;
  qty_raw: string | null;
  qty_value: number | null;
  qty_source: string | null;
  unit_raw: string | null;
  unit_normalized: string | null;
  unit_price: number | null;
  total_price: number | null;
  is_product: boolean;
}

interface ExcludedLine {
  line_index: number;
  description: string;
  reason: string;
}

interface QtyRefCandidate {
  value: number;
  unit: string;
  confidence: number;
  evidence_line_id: number | null;
  source: string;
  evidence_line?: string;
}

interface QtyRefDebug {
  category_code: string | null;
  expected_unit_type: string | null;
  qty_ref_detected: boolean;
  qty_ref_type: string | null;
  qty_ref_value: number | null;
  qty_ref_source: string;
  qty_ref_candidates: QtyRefCandidate[];
  qty_ref_selection_rule: string | null;
  qty_ref_failure_reason: string | null;
  product_lines_count: number;
  excluded_lines_count: number;
}

// ============ UNIT NORMALIZATION ============

function normalizeUnit(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase().trim();
  
  // m², M², m2, M2, m^2 → m2
  if (/m[²2\^]|mètres?\s*carrés?/i.test(normalized)) return "m2";
  
  // ml, ML → ml
  if (/ml|m\.?l\.?|mètres?\s*linéaires?/i.test(normalized)) return "ml";
  
  // u, unité, U → unit
  if (/^u$|unité|pièce|pce/i.test(normalized)) return "unit";
  
  // forfait → forfait
  if (/forfait|ens(?:emble)?/i.test(normalized)) return "forfait";
  
  // h, heure → h
  if (/^h$|heure/i.test(normalized)) return "h";
  
  // jour → jour
  if (/^j$|jour/i.test(normalized)) return "jour";
  
  return null;
}

// ============ EXCLUSION RULES ============

const NON_PRODUCT_KEYWORDS = [
  // Main-d'œuvre / pose
  "pose", "installation", "dépose", "démontage", "main d'œuvre", "main-d'œuvre", "mo", "heures", 
  // Frais & logistique
  "déplacement", "transport", "livraison", "frais", "gestion", "chantier", "mise en service", "mise en œuvre",
  // Administratif
  "étude", "devis", "dossier", "formalités", "bureau", "ingénierie",
  // Options non matérielles
  "garantie", "extension", "maintenance", "contrat", "assistance", "support",
  // Remises / ajustements
  "remise", "réduction", "rabais", "avoir",
];

function isNonProductLine(label: string, unitNormalized: string | null, totalPrice: number | null): { excluded: boolean; reason: string | null } {
  // Rule 1: Forfait units are non-product
  if (unitNormalized === "forfait") {
    return { excluded: true, reason: "unit_is_forfait" };
  }
  
  // Rule 2: Negative amounts are non-product
  if (totalPrice !== null && totalPrice < 0) {
    return { excluded: true, reason: "negative_amount" };
  }
  
  // Rule 3: Keywords check (case-insensitive)
  const labelLower = label.toLowerCase();
  for (const keyword of NON_PRODUCT_KEYWORDS) {
    if (labelLower.includes(keyword.toLowerCase())) {
      return { excluded: true, reason: `keyword:${keyword}` };
    }
  }
  
  return { excluded: false, reason: null };
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

interface UnitDetectionResult {
  unit: string | null;
  qty: number | null;
  unit_raw: string | null;
  qty_raw: string | null;
}

function detectUnit(text: string): UnitDetectionResult {
  const normalizedText = text.toLowerCase();
  
  for (const [unit, patterns] of Object.entries(UNIT_PATTERNS)) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(normalizedText);
      if (match) {
        if (unit === "forfait") {
          return { unit: "forfait", qty: 1, unit_raw: match[0], qty_raw: "1" };
        }
        const qtyStr = match[1];
        if (qtyStr) {
          const qty = parseFloat(qtyStr.replace(/\s/g, '').replace(',', '.'));
          if (!isNaN(qty) && qty > 0) {
            return { unit, qty, unit_raw: match[0], qty_raw: qtyStr };
          }
        }
      }
    }
  }
  
  return { unit: null, qty: null, unit_raw: null, qty_raw: null };
}

// ============ HELPER: PRICE EXTRACTION ============

const PRICE_PATTERNS = [
  /(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})\s*€/g,
  /€\s*(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})/g,
  /(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})\s*EUR/gi,
];

function extractPrice(text: string): number | null {
  for (const pattern of PRICE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const priceStr = match[1].replace(/[\s\u00a0]/g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      if (!isNaN(price)) {
        return price;
      }
    }
  }
  return null;
}

function extractAllPrices(text: string): number[] {
  const prices: number[] = [];
  for (const pattern of PRICE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const priceStr = match[1].replace(/[\s\u00a0]/g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      if (!isNaN(price) && price > 0) {
        prices.push(price);
      }
    }
  }
  return [...new Set(prices)].sort((a, b) => a - b);
}

// ============ HELPER: TOTALS EXTRACTION ============

function extractTotals(text: string): { ht: number | null; tva: number | null; ttc: number | null } {
  const lines = text.split('\n');
  let ht: number | null = null;
  let tva: number | null = null;
  let ttc: number | null = null;
  
  for (const line of lines) {
    if (/total\s*(?:général\s*)?ttc|ttc\s*:?|net\s*à\s*payer/i.test(line)) {
      const price = extractPrice(line);
      if (price) ttc = price;
    }
    else if (/total\s*(?:général\s*)?ht|ht\s*:|montant\s*ht/i.test(line)) {
      const price = extractPrice(line);
      if (price) ht = price;
    }
    else if (/tva\s*(?:\d+\s*%)?|montant\s*tva/i.test(line)) {
      const price = extractPrice(line);
      if (price) tva = price;
    }
  }
  
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
  
  if (/chèque|cheque/i.test(text)) methods.push("chèque");
  if (/espèces|espece/i.test(text)) methods.push("espèces");
  if (/virement/i.test(text)) methods.push("virement");
  if (/carte\s*(?:bancaire)?|cb/i.test(text)) methods.push("carte bancaire");
  
  const depositMatch = /acompte\s*(?:de\s*)?(\d+)\s*%/i.exec(text);
  if (depositMatch) {
    deposit_pct = parseInt(depositMatch[1], 10);
  }
  
  const ibanMatch = /([A-Z]{2}\d{2}(?:\s?\d{4}){5,6})/i.exec(text);
  if (ibanMatch) {
    iban = ibanMatch[1].replace(/\s/g, '').toUpperCase();
  }
  
  return { methods, deposit_pct, iban };
}

// ============ ARITHMETIC PROOF: PU × q ≈ Total ============

/**
 * For each line with unit_price and total_price, try to find an integer q ∈ [1..50]
 * such that abs(unit_price*q - total_price) / max(total_price,1) < 0.02
 */
function tryPriceConsistencyQty(
  unitPrice: number | null, 
  totalPrice: number | null
): { qty: number; source: "price_consistency" } | null {
  if (!unitPrice || !totalPrice || unitPrice <= 0 || totalPrice <= 0) return null;
  
  // Try integer quantities from 1 to 50
  for (let q = 1; q <= 50; q++) {
    const expectedTotal = unitPrice * q;
    const error = Math.abs(expectedTotal - totalPrice) / Math.max(totalPrice, 1);
    if (error < 0.02) {
      return { qty: q, source: "price_consistency" };
    }
  }
  
  return null;
}

/**
 * For lines with 2+ prices, infer qty from price consistency
 * Assumes smaller price is unit price, larger is total
 */
function tryInferQtyFromPrices(
  textLine: string,
  totalPrice: number
): { qty: number; unitPrice: number; source: "price_consistency" } | null {
  const prices = extractAllPrices(textLine);
  if (prices.length < 2) return null;
  
  const unitPrice = prices[0];
  const lineTotal = prices[prices.length - 1];
  
  // Only if the last price matches the detected total price
  if (Math.abs(lineTotal - totalPrice) > 0.01) return null;
  
  for (let q = 1; q <= 50; q++) {
    const expectedTotal = unitPrice * q;
    const error = Math.abs(expectedTotal - lineTotal) / Math.max(lineTotal, 1);
    if (error < 0.02) {
      return { qty: q, unitPrice, source: "price_consistency" };
    }
  }
  
  return null;
}

// ============ EMBEDDED QTY DETECTION ============

/**
 * Detect quantity embedded in label (e.g., "Visio 2" → qty=2)
 * Uses price consistency check when possible
 */
function tryExtractEmbeddedQty(
  label: string, 
  totalPrice: number, 
  textLine: string
): { qty: number; source: "price_consistency" | "embedded_in_label" } | null {
  // Pattern: label ending with an integer (1-3 digits)
  const embeddedQtyPattern = /(.+?)\s+(\d{1,3})$/;
  const match = label.match(embeddedQtyPattern);
  
  if (!match) return null;
  
  const potentialQty = parseInt(match[2], 10);
  if (potentialQty < 1 || potentialQty > 100) return null;
  
  // Try price consistency validation
  const prices = extractAllPrices(textLine);
  if (prices.length >= 2) {
    const unitPrice = prices[0];
    const expectedTotal = unitPrice * potentialQty;
    const actualTotal = prices[prices.length - 1];
    
    const error = Math.abs(expectedTotal - actualTotal) / Math.max(actualTotal, 1);
    if (error < 0.02) {
      return { qty: potentialQty, source: "price_consistency" };
    }
  }
  
  // Fallback: weak embedded detection (1-10, product name looks valid)
  if (potentialQty >= 1 && potentialQty <= 10 && match[1].length >= 5) {
    if (/[a-zA-ZÀ-ÿ]{3,}/.test(match[1])) {
      return { qty: potentialQty, source: "embedded_in_label" };
    }
  }
  
  return null;
}

// ============ LINE PARSING ============

interface ParseLineResult {
  lines: ParsedLine[];
  rawLines: string[];
  qtyParseErrors: string[];
  excludedLines: ExcludedLine[];
}

function parseLines(text: string): ParseLineResult {
  const lines: ParsedLine[] = [];
  const rawLines: string[] = [];
  const qtyParseErrors: string[] = [];
  const excludedLines: ExcludedLine[] = [];
  const textLines = text.split('\n');
  
  let lineIndex = 0;
  
  for (const textLine of textLines) {
    if (!textLine.trim() || textLine.trim().length < 10) continue;
    if (/^(?:désignation|description|libellé|quantité|prix|total|ht|ttc)/i.test(textLine.trim())) continue;
    
    const price = extractPrice(textLine);
    if (!price) continue;
    
    rawLines.push(textLine);
    
    const { unit, qty, unit_raw, qty_raw } = detectUnit(textLine);
    const unitNormalized = normalizeUnit(unit);
    
    let label = textLine
      .replace(/(\d{1,3}(?:[\s\u00a0]?\d{3})*[,\.]\d{2})\s*€?/g, '')
      .replace(/\d+[\s,.]?\d*\s*(?:m²|m2|ml|u|unité|forfait|h|heure|j|jour)/gi, '')
      .trim();
    
    label = label.replace(/^\s*[-–•]\s*/, '').trim();
    
    if (label.length < 3) continue;
    
    let finalQty = qty;
    let finalUnit = unit;
    let finalQtyRaw = qty_raw;
    let qtySource: ParsedLine["qty_source"] = qty ? "column" : undefined;
    
    // If no qty detected via column, try price consistency
    if (finalQty === null) {
      const priceConsistencyResult = tryInferQtyFromPrices(textLine, price);
      if (priceConsistencyResult) {
        finalQty = priceConsistencyResult.qty;
        finalUnit = "unité";
        finalQtyRaw = String(priceConsistencyResult.qty);
        qtySource = "price_consistency";
      }
    }
    
    // If still no qty, try embedded detection
    if (finalQty === null) {
      const embeddedResult = tryExtractEmbeddedQty(label, price, textLine);
      if (embeddedResult) {
        finalQty = embeddedResult.qty;
        finalUnit = "unité";
        finalQtyRaw = String(embeddedResult.qty);
        qtySource = embeddedResult.source === "price_consistency" ? "price_consistency" : "embedded_in_label";
      }
    }
    
    const finalUnitNormalized = normalizeUnit(finalUnit);
    
    // Check exclusion rules
    const exclusion = isNonProductLine(label, finalUnitNormalized, price);
    const isProduct = !exclusion.excluded && finalQty !== null && finalQty > 0;
    
    if (exclusion.excluded) {
      excludedLines.push({
        line_index: lineIndex,
        description: label.substring(0, 80),
        reason: exclusion.reason || "unknown",
      });
    }
    
    // Track parsing errors
    if (finalQty === null && /\d/.test(textLine) && !exclusion.excluded) {
      qtyParseErrors.push(`Line ${lineIndex}: "${textLine.substring(0, 50)}...": contains digits but qty not detected`);
    }
    
    const parsedLine: ParsedLine = {
      label,
      qty: finalQty,
      unit: finalUnit,
      unit_normalized: finalUnitNormalized,
      unit_price_ht: (finalQty && price && finalQty > 0) ? price / finalQty : null,
      total_ht: price,
      qty_raw: finalQtyRaw || undefined,
      unit_raw: unit_raw || undefined,
      qty_source: qtySource,
      is_product: isProduct,
      exclusion_reason: exclusion.reason || undefined,
      line_index: lineIndex,
    };
    
    lines.push(parsedLine);
    lineIndex++;
  }
  
  return { lines, rawLines, qtyParseErrors, excludedLines };
}

// ============ HELPER: FIND MAX QUANTITY ============

interface MaxQtyResult {
  qty: number | null;
  unit: string | null;
  lineIndex: number | null;
  evidenceLine: string | null;
}

function findMaxQuantity(lines: ParsedLine[], targetUnitNormalized: string): MaxQtyResult {
  let maxQty: number | null = null;
  let maxUnit: string | null = null;
  let lineIndex: number | null = null;
  let evidenceLine: string | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.unit_normalized === targetUnitNormalized && line.qty !== null && line.is_product) {
      if (maxQty === null || line.qty > maxQty) {
        maxQty = line.qty;
        maxUnit = line.unit;
        lineIndex = line.line_index;
        evidenceLine = line.label.substring(0, 60);
      }
    }
  }
  
  return { qty: maxQty, unit: maxUnit, lineIndex, evidenceLine };
}

// ============ HELPER: FIND SURFACE TOTALE TAG ============

interface SurfaceTotaleResult {
  qty: number | null;
  lineIndex: number | null;
  evidenceLine: string | null;
}

function findSurfaceTotaleLine(lines: ParsedLine[]): SurfaceTotaleResult {
  const surfaceTotalPatterns = [
    /surface\s*totale/i,
    /total\s*(?:surface|m²|m2)/i,
    /superficie\s*totale/i,
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of surfaceTotalPatterns) {
      if (pattern.test(line.label) && line.unit_normalized === "m2" && line.qty !== null && line.qty > 1) {
        return { qty: line.qty, lineIndex: line.line_index, evidenceLine: line.label.substring(0, 60) };
      }
    }
  }
  
  // Fallback: largest m² line
  const m2Lines = lines.filter(l => l.unit_normalized === "m2" && l.qty !== null && l.qty > 1 && l.is_product);
  if (m2Lines.length > 0) {
    const maxM2Line = m2Lines.reduce((max, line) => 
      (line.qty || 0) > (max.qty || 0) ? line : max
    );
    return { qty: maxM2Line.qty, lineIndex: maxM2Line.line_index, evidenceLine: maxM2Line.label.substring(0, 60) };
  }
  
  return { qty: null, lineIndex: null, evidenceLine: null };
}

// ============ HELPER: FIND GLOBAL SURFACE FIELD ============

function findGlobalSurfaceField(text: string): { qty: number; evidenceLine: string } | null {
  const globalPatterns = [
    /surface\s*(?:totale\s*)?[:=]\s*(\d+[\s,.]?\d*)\s*m²/gi,
    /total\s*m²\s*[:=]?\s*(\d+[\s,.]?\d*)/gi,
    /superficie\s*[:=]\s*(\d+[\s,.]?\d*)\s*m²/gi,
    /(\d+[\s,.]?\d*)\s*m²\s*(?:au\s*)?total/gi,
    /surface\s*(?:à\s*traiter|concernée)\s*[:=]?\s*(\d+[\s,.]?\d*)\s*m²/gi,
  ];
  
  const lines = text.split('\n');
  for (const line of lines) {
    for (const pattern of globalPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        const qty = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(qty) && qty > 1) {
          return { qty, evidenceLine: line.substring(0, 60) };
        }
      }
    }
  }
  
  return null;
}

// ============ HELPER: SUM PRODUCT QUANTITIES ============

interface SumQtyResult {
  sum: number | null;
  productLinesWithQty: number;
  totalProductLines: number;
  sources: string[];
}

function sumProductQuantities(lines: ParsedLine[], targetUnitNormalized: string): SumQtyResult {
  const productLines = lines.filter(l => l.is_product && l.unit_normalized === targetUnitNormalized);
  const linesWithQty = productLines.filter(l => l.qty !== null && l.qty > 0);
  
  if (linesWithQty.length === 0) {
    return { sum: null, productLinesWithQty: 0, totalProductLines: productLines.length, sources: [] };
  }
  
  const sum = linesWithQty.reduce((acc, line) => acc + (line.qty || 0), 0);
  const sources = [...new Set(linesWithQty.map(l => l.qty_source || "unknown"))];
  
  return { sum, productLinesWithQty: linesWithQty.length, totalProductLines: productLines.length, sources };
}

// ============ MAIN PARSER ============

interface QtyRefResult {
  qty_ref: number | null;
  qty_unit: string | null;
  qty_source: string;
  qty_detected: boolean;
}

interface ParseResult {
  parsed: ParsedQuote;
  parserDebug: ParserDebug;
  qtyRefDebug: QtyRefDebug;
}

function parseQuote(rawText: string, blocks?: any[], categoryCode?: string): ParseResult {
  const warnings: string[] = [];
  const qtyRefCandidates: QtyRefCandidate[] = [];
  
  const text = rawText;
  
  // Extract totals
  const totals = extractTotals(text);
  if (!totals.ht && !totals.ttc) {
    warnings.push("Aucun montant total (HT ou TTC) n'a été détecté.");
  }
  
  // Extract payments
  const payments = extractPayments(text);
  
  // Parse lines with debug info
  const { lines, rawLines, qtyParseErrors, excludedLines } = parseLines(text);
  if (lines.length === 0) {
    warnings.push("Aucune ligne de devis détaillée n'a pu être extraite.");
  }
  
  // Product lines stats
  const productLines = lines.filter(l => l.is_product);
  const productLinesWithQty = productLines.filter(l => l.qty !== null && l.qty > 0);
  
  // Count lines with missing quantities
  const linesWithoutQty = lines.filter(l => l.qty === null && !l.exclusion_reason);
  if (linesWithoutQty.length > 0) {
    warnings.push(`${linesWithoutQty.length} ligne(s) produit sans quantité détectée.`);
  }
  
  // Build detected units set
  const detectedUnitsSet = [...new Set(lines.filter(l => l.unit_normalized).map(l => l.unit_normalized!))];
  
  // Build sample lines (max 10)
  const sampleLines: SampleLine[] = lines.slice(0, 10).map((line, idx) => ({
    raw_line: rawLines[idx] || "",
    description: line.label,
    qty_raw: line.qty_raw || null,
    qty_value: line.qty,
    qty_source: line.qty_source || null,
    unit_raw: line.unit_raw || null,
    unit_normalized: line.unit_normalized,
    unit_price: line.unit_price_ht,
    total_price: line.total_ht,
    is_product: line.is_product,
  }));
  
  // ====== QTY_REF DETECTION RULES ======
  
  let qtyResult: QtyRefResult = {
    qty_ref: null,
    qty_unit: null,
    qty_source: "not_found",
    qty_detected: false,
  };
  
  let selectionRule: string | null = null;
  let failureReason: string | null = null;
  
  // ÉTAPE 1: Chercher une ligne explicitement taggée "surface_totale" (m²)
  const surfaceTotaleResult = findSurfaceTotaleLine(lines);
  if (surfaceTotaleResult.qty !== null && surfaceTotaleResult.qty > 1) {
    qtyRefCandidates.push({
      value: surfaceTotaleResult.qty,
      unit: "m2",
      confidence: 1.0,
      evidence_line_id: surfaceTotaleResult.lineIndex,
      source: "surface_totale_line",
      evidence_line: surfaceTotaleResult.evidenceLine || undefined,
    });
    qtyResult = {
      qty_ref: surfaceTotaleResult.qty,
      qty_unit: "m2",
      qty_source: "surface_totale_line",
      qty_detected: true,
    };
    selectionRule = "Picked explicit 'surface totale' tagged line";
  }
  
  // ÉTAPE 2: Sinon, chercher un champ global (ex: "Surface : 192 m²")
  if (qtyResult.qty_ref === null) {
    const globalSurface = findGlobalSurfaceField(text);
    if (globalSurface !== null && globalSurface.qty > 1) {
      qtyRefCandidates.push({
        value: globalSurface.qty,
        unit: "m2",
        confidence: 0.9,
        evidence_line_id: null,
        source: "global_field",
        evidence_line: globalSurface.evidenceLine,
      });
      qtyResult = {
        qty_ref: globalSurface.qty,
        qty_unit: "m2",
        qty_source: "global_field",
        qty_detected: true,
      };
      selectionRule = "Found global surface field in document text";
    }
  }
  
  // ÉTAPE 3a: Chercher le max m² dans les lignes PRODUIT
  if (qtyResult.qty_ref === null) {
    const maxM2 = findMaxQuantity(lines, "m2");
    if (maxM2.qty !== null && maxM2.qty > 1) {
      qtyRefCandidates.push({
        value: maxM2.qty,
        unit: "m2",
        confidence: 0.7,
        evidence_line_id: maxM2.lineIndex,
        source: "max_m2",
        evidence_line: maxM2.evidenceLine || undefined,
      });
      qtyResult = {
        qty_ref: maxM2.qty,
        qty_unit: "m2",
        qty_source: "max_m2",
        qty_detected: true,
      };
      selectionRule = "Picked largest m² quantity from product lines";
    }
  }
  
  // ÉTAPE 3b: Sinon chercher le max ml
  if (qtyResult.qty_ref === null) {
    const maxMl = findMaxQuantity(lines, "ml");
    if (maxMl.qty !== null && maxMl.qty > 1) {
      qtyRefCandidates.push({
        value: maxMl.qty,
        unit: "ml",
        confidence: 0.7,
        evidence_line_id: maxMl.lineIndex,
        source: "max_ml",
        evidence_line: maxMl.evidenceLine || undefined,
      });
      qtyResult = {
        qty_ref: maxMl.qty,
        qty_unit: "ml",
        qty_source: "max_ml",
        qty_detected: true,
      };
      selectionRule = "Picked largest ml quantity from product lines";
    }
  }
  
  // ÉTAPE 3c: Pour les unités, sum des qty PRODUIT si toutes ont qty_detected
  if (qtyResult.qty_ref === null) {
    const unitSum = sumProductQuantities(lines, "unit");
    if (unitSum.sum !== null && unitSum.sum > 0) {
      // High confidence if ALL product lines have qty
      const confidence = unitSum.productLinesWithQty === unitSum.totalProductLines ? 0.85 : 0.5;
      qtyRefCandidates.push({
        value: unitSum.sum,
        unit: "unit",
        confidence,
        evidence_line_id: null,
        source: "sum_product_units",
        evidence_line: `Sum of ${unitSum.productLinesWithQty} product lines (sources: ${unitSum.sources.join(', ')})`,
      });
      
      // Only auto-select if complete coverage
      if (unitSum.productLinesWithQty === unitSum.totalProductLines && unitSum.productLinesWithQty > 0) {
        qtyResult = {
          qty_ref: unitSum.sum,
          qty_unit: "unit",
          qty_source: "sum_product_units",
          qty_detected: true,
        };
        selectionRule = `Summed all product unit quantities (${unitSum.productLinesWithQty} lines, sources: ${unitSum.sources.join(', ')})`;
      } else if (unitSum.totalProductLines > 0) {
        warnings.push(`Quantités partielles détectées pour les unités (${unitSum.productLinesWithQty}/${unitSum.totalProductLines}).`);
        failureReason = `Partial unit quantities: only ${unitSum.productLinesWithQty}/${unitSum.totalProductLines} product lines have detected qty`;
      }
    }
  }
  
  // ÉTAPE 4: count_product_lines candidate (low confidence, requires user confirmation)
  if (productLines.length > 0 && productLines.length <= 30) {
    qtyRefCandidates.push({
      value: productLines.length,
      unit: "unit",
      confidence: 0.3,
      evidence_line_id: null,
      source: "count_product_lines",
      evidence_line: `Count of ${productLines.length} product lines (excludes: ${excludedLines.length} non-product lines)`,
    });
    // Do NOT auto-select - just a suggestion for UI
  }
  
  // RÈGLE ABSOLUE: si qty_ref <= 1, considérer comme non fiable (sauf pour unit où 1 peut être valide)
  if (qtyResult.qty_ref !== null && qtyResult.qty_ref <= 1 && qtyResult.qty_unit !== "unit") {
    warnings.push("Surface/quantité de référence détectée <= 1. Considérée comme non fiable.");
    failureReason = `Detected qty_ref (${qtyResult.qty_ref}) is <= 1 for surface unit, considered unreliable`;
    qtyResult = {
      qty_ref: null,
      qty_unit: null,
      qty_source: "not_found",
      qty_detected: false,
    };
    selectionRule = null;
  }
  
  // Si pas de qty_ref trouvé, ajouter un warning explicite
  if (qtyResult.qty_ref === null) {
    warnings.push("Aucune quantité de référence fiable détectée. Saisie manuelle requise pour l'analyse de prix.");
    if (!failureReason) {
      failureReason = `No auto-validated qty found. Lines: ${lines.length}, products: ${productLines.length}, with_qty: ${productLinesWithQty.length}, units: [${detectedUnitsSet.join(', ')}]`;
    }
  }
  
  // ====== CRITICAL FIX: Ensure consistency between detected and value ======
  // If qty_ref_value is NULL, qty_ref_detected MUST be false
  const finalQtyDetected = qtyResult.qty_ref !== null;
  if (qtyResult.qty_ref === null && qtyResult.qty_detected) {
    failureReason = "value_null";
    qtyResult.qty_detected = false;
  }
  
  // Build parser debug
  const parserDebug: ParserDebug = {
    parser_version: PARSER_VERSION,
    line_items_count: lines.length,
    line_items_with_qty_count: lines.filter(l => l.qty !== null).length,
    line_items_with_unit_count: lines.filter(l => l.unit !== null).length,
    product_lines_count: productLines.length,
    excluded_lines_count: excludedLines.length,
    detected_units_set: detectedUnitsSet,
    qty_parse_errors: qtyParseErrors,
    sample_lines: sampleLines,
    excluded_lines: excludedLines.slice(0, 10), // Max 10
    textract_tables_used: false, // Will be set by caller if table data is used
  };
  
  // Build qty_ref debug
  const qtyRefDebug: QtyRefDebug = {
    category_code: categoryCode || null,
    expected_unit_type: null,
    qty_ref_detected: finalQtyDetected,
    qty_ref_type: qtyResult.qty_unit,
    qty_ref_value: qtyResult.qty_ref,
    qty_ref_source: qtyResult.qty_source,
    qty_ref_candidates: qtyRefCandidates,
    qty_ref_selection_rule: selectionRule,
    qty_ref_failure_reason: failureReason,
    product_lines_count: productLines.length,
    excluded_lines_count: excludedLines.length,
  };
  
  const parsed: ParsedQuote = {
    totals,
    payments,
    lines,
    work_categories: [],
    qty_ref: qtyResult.qty_ref,
    qty_unit: qtyResult.qty_unit,
    parsing_warnings: warnings,
  };
  
  return { parsed, parserDebug, qtyRefDebug };
}

// ============ MAIN HANDLER ============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let requestId: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { analysis_id, raw_text, blocks, category_code, request_id: incomingRequestId } = body;
    requestId = incomingRequestId || crypto.randomUUID();

    if (!analysis_id || !raw_text) {
      return new Response(
        JSON.stringify({ error: "Missing analysis_id or raw_text", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("=== PARSE-QUOTE V3 START ===");
    console.log("Request ID:", requestId);
    console.log("Analysis ID:", analysis_id);
    console.log("Text length:", raw_text.length);
    console.log("Category code:", category_code || "not specified");

    // Parse the quote with full debug info
    const { parsed, parserDebug, qtyRefDebug } = parseQuote(raw_text, blocks, category_code);

    console.log("Parsing complete (v3.0.0):");
    console.log("- Lines found:", parsed.lines.length);
    console.log("- Product lines:", parserDebug.product_lines_count);
    console.log("- Excluded lines:", parserDebug.excluded_lines_count);
    console.log("- Lines with qty:", parserDebug.line_items_with_qty_count);
    console.log("- Qty ref:", parsed.qty_ref, parsed.qty_unit);
    console.log("- Qty ref source:", qtyRefDebug.qty_ref_source);
    console.log("- Qty candidates:", qtyRefDebug.qty_ref_candidates.length);
    
    if (qtyRefDebug.qty_ref_failure_reason) {
      console.log("⚠️ qty_ref_failure_reason:", qtyRefDebug.qty_ref_failure_reason);
    }

    // Update document_extractions with parsed data and debug
    const { error: updateError } = await supabase
      .from("document_extractions")
      .update({
        parsed_data: parsed,
        qty_ref_detected: parsed.qty_ref,
        qty_unit: parsed.qty_unit,
        parser_debug: parserDebug,
        qty_ref_debug: qtyRefDebug,
        qtyref_candidates: qtyRefDebug.qty_ref_candidates,
        qtyref_status: parsed.qty_ref !== null ? "success" : "needs_confirmation",
        qtyref_failure_reason: qtyRefDebug.qty_ref_failure_reason,
        parser_status: "success",
      })
      .eq("analysis_id", analysis_id);

    if (updateError) {
      console.error("Failed to update document_extractions:", updateError);
    }

    console.log("=== PARSE-QUOTE V3 COMPLETE ===");

    return new Response(
      JSON.stringify({
        success: true,
        request_id: requestId,
        data: parsed,
        debug: {
          parser: parserDebug,
          qty_ref: qtyRefDebug,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        request_id: requestId 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
