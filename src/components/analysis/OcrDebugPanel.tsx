import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Bug, Database, Clock, FileDigit, Layers, Zap, FileText, Table2, 
  ChevronDown, AlertTriangle, CheckCircle2, XCircle, Package, Calculator,
  List, Hash, Target
} from "lucide-react";
import { Json } from "@/integrations/supabase/types";

interface OcrDebugData {
  provider: string;
  ocr_used: boolean;
  pages_used: number | null;
  pages_count: number | null;
  quality_score: number | null;
  cache_hit: boolean;
  file_hash: string;
  provider_calls: ProviderCall[] | null;
  created_at: string;
  text_length: number | null;
  contains_table_signals: boolean | null;
  ocr_reason: string | null;
  request_id: string | null;
  force_textract: boolean | null;
  pages_used_list: number[] | null;
  text_length_by_page: PageTextLength[] | null;
  textract_debug: TextractDebug | null;
  ocr_debug: OcrDebug | null;
  parser_debug: ParserDebug | null;
  qty_ref_debug: QtyRefDebug | null;
  qty_ref_detected: number | null;
  qty_unit: string | null;
}

interface ProviderCall {
  provider: string;
  latency_ms: number;
  pages_used: number;
  success: boolean;
  error?: string;
}

interface PageTextLength {
  page: number;
  length: number;
}

interface TextractDebug {
  textract_job_id: string | null;
  textract_mode: string;
  textract_pages_returned: number;
  textract_blocks_count: number;
  textract_tables_count: number;
  textract_cells_count: number;
  textract_warning: string | null;
}

interface OcrDebug {
  ocr_provider: string;
  ocr_reason: string;
  sha256: string;
  pages_total: number;
  pages_used: number;
  pages_used_list: number[];
  text_length_total: number;
  text_length_by_page: PageTextLength[];
  cache_hit: boolean;
  provider_calls: ProviderCall[];
}

interface SampleLine {
  raw_line: string;
  description: string;
  qty_raw: string | null;
  qty_value: number | null;
  unit_raw: string | null;
  unit_normalized: string | null;
  unit_price: number | null;
  total_price: number | null;
}

interface ParserDebug {
  parser_version: string;
  line_items_count: number;
  line_items_with_qty_count: number;
  line_items_with_unit_count: number;
  detected_units_set: string[];
  qty_parse_errors: string[];
  sample_lines: SampleLine[];
}

interface QtyRefCandidate {
  value: number;
  unit: string;
  confidence: number;
  evidence_line_id: number | null;
  source: string;
}

interface JobSpecificMatch {
  value: number;
  source: string;
  line: string;
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
  // V3.1 additions
  job_type: string | null;
  job_type_confidence: string | null;
  job_type_keywords: string[] | null;
  job_specific_matches: JobSpecificMatch[] | null;
}

interface OcrDebugPanelProps {
  analysisId: string;
}

// Helper to safely parse JSON fields
function parseJsonField<T>(field: Json | null | undefined): T | null {
  if (!field) return null;
  if (typeof field === 'object') return field as unknown as T;
  try {
    return JSON.parse(field as string) as T;
  } catch {
    return null;
  }
}

export const OcrDebugPanel = ({ analysisId }: OcrDebugPanelProps) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [debugData, setDebugData] = useState<OcrDebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    ocr: true,
    textract: false,
    parser: false,
    qtyRef: true,
    providerCalls: false,
    sampleLines: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    const checkAdminAndFetchData = async () => {
      try {
        const { data: isAdminResult } = await supabase.rpc("is_admin");
        
        if (!isAdminResult) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        
        setIsAdmin(true);
        
        const { data: extraction, error } = await supabase
          .from("document_extractions")
          .select(`
            provider, ocr_used, pages_used, pages_count, quality_score, cache_hit, 
            file_hash, provider_calls, created_at, text_length, contains_table_signals, 
            ocr_reason, request_id, force_textract, pages_used_list, text_length_by_page,
            textract_debug, ocr_debug, parser_debug, qty_ref_debug, qty_ref_detected, qty_unit
          `)
          .eq("analysis_id", analysisId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        
        if (error) {
          console.error("No extraction data found:", error.message);
        } else if (extraction) {
          setDebugData({
            ...extraction,
            provider_calls: parseJsonField<ProviderCall[]>(extraction.provider_calls),
            pages_used_list: extraction.pages_used_list as number[] | null,
            text_length_by_page: parseJsonField<PageTextLength[]>(extraction.text_length_by_page),
            textract_debug: parseJsonField<TextractDebug>(extraction.textract_debug),
            ocr_debug: parseJsonField<OcrDebug>(extraction.ocr_debug),
            parser_debug: parseJsonField<ParserDebug>(extraction.parser_debug),
            qty_ref_debug: parseJsonField<QtyRefDebug>(extraction.qty_ref_debug),
          } as OcrDebugData);
        }
      } catch (err) {
        console.error("Error fetching OCR debug data:", err);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndFetchData();
  }, [analysisId]);

  if (!isAdmin || loading) {
    return null;
  }

  const totalLatencyMs = debugData?.provider_calls?.reduce(
    (sum, call) => sum + (call.latency_ms || 0),
    0
  ) || 0;

  const getProviderBadgeColor = (provider: string) => {
    switch (provider) {
      case "pdf_text": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "textract": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "gemini_ai": return "bg-violet-500/20 text-violet-400 border-violet-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const parserDebug = debugData?.parser_debug;
  const qtyRefDebug = debugData?.qty_ref_debug;
  const textractDebug = debugData?.textract_debug;

  return (
    <div className="mt-6">
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="flex items-center gap-2 text-[11px] text-violet-400/60 hover:text-violet-400 transition-colors mx-auto"
      >
        <Bug className="h-3 w-3" />
        {panelOpen ? "Masquer debug admin" : "Debug admin"}
        <ChevronDown className={`h-3 w-3 transition-transform ${panelOpen ? "rotate-180" : ""}`} />
      </button>
      {panelOpen && (
    <Card className="mt-2 border-dashed border-2 border-violet-500/30 bg-violet-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-violet-400">
          <Bug className="h-4 w-4" />
          Debug Complet (Admin)
          {debugData?.request_id && (
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">
              req: {debugData.request_id.substring(0, 8)}...
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!debugData ? (
          <p className="text-xs text-muted-foreground">Aucune donnée d'extraction trouvée.</p>
        ) : (
          <>
            {/* Section 1: OCR Debug */}
            <Collapsible open={expandedSections.ocr} onOpenChange={() => toggleSection('ocr')}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-xs font-medium text-violet-300 hover:text-violet-200">
                <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.ocr ? '' : '-rotate-90'}`} />
                <Zap className="h-3 w-3" />
                1️⃣ DEBUG OCR
                {debugData.force_textract && <Badge className="text-[10px] bg-amber-500/20 text-amber-400">FORCED</Badge>}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-muted/30 rounded p-3">
                  <div>
                    <p className="text-muted-foreground">ocr_provider</p>
                    <Badge variant="outline" className={`mt-1 text-[10px] ${getProviderBadgeColor(debugData.provider)}`}>
                      {debugData.provider}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ocr_reason</p>
                    <p className="font-mono text-foreground mt-1 text-[10px]">{debugData.ocr_reason || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">sha256</p>
                    <p className="font-mono text-foreground mt-1 text-[10px] truncate" title={debugData.file_hash}>
                      {debugData.file_hash?.substring(0, 12)}...
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">cache_hit</p>
                    <Badge variant="outline" className={`mt-1 text-[10px] ${debugData.cache_hit ? "bg-emerald-500/20 text-emerald-400" : "bg-muted"}`}>
                      {debugData.cache_hit ? "true" : "false"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">pages_total / used</p>
                    <p className="font-mono text-foreground mt-1">{debugData.pages_count ?? "-"} / {debugData.pages_used ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">pages_used_list</p>
                    <p className="font-mono text-foreground mt-1 text-[10px]">
                      {debugData.pages_used_list?.length ? `[${debugData.pages_used_list.join(',')}]` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">text_length_total</p>
                    <p className="font-mono text-foreground mt-1">
                      {debugData.text_length?.toLocaleString() ?? "-"}
                      {debugData.text_length !== null && (
                        <span className={`ml-1 ${debugData.text_length >= 1500 ? "text-emerald-400" : "text-amber-400"}`}>
                          {debugData.text_length >= 1500 ? "✓" : "< 1500"}
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">contains_table_signals</p>
                    <Badge variant="outline" className={`mt-1 text-[10px] ${debugData.contains_table_signals ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {debugData.contains_table_signals ? "true" : "false"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">latency_ms_total</p>
                    <p className="font-mono text-foreground mt-1">{totalLatencyMs > 0 ? `${totalLatencyMs.toLocaleString()} ms` : "-"}</p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Section: Textract Debug */}
            {textractDebug && (
              <Collapsible open={expandedSections.textract} onOpenChange={() => toggleSection('textract')}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-xs font-medium text-amber-300 hover:text-amber-200">
                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.textract ? '' : '-rotate-90'}`} />
                  <Package className="h-3 w-3" />
                  AWS Textract Details
                  {textractDebug.textract_warning && <AlertTriangle className="h-3 w-3 text-amber-400" />}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-amber-500/10 rounded p-3">
                    <div>
                      <p className="text-muted-foreground">textract_mode</p>
                      <p className="font-mono text-foreground mt-1 text-[10px]">{textractDebug.textract_mode}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">textract_blocks_count</p>
                      <p className="font-mono text-foreground mt-1">{textractDebug.textract_blocks_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">textract_tables_count</p>
                      <p className={`font-mono mt-1 ${textractDebug.textract_tables_count === 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {textractDebug.textract_tables_count}
                        {textractDebug.textract_tables_count === 0 && " ⚠️"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">textract_cells_count</p>
                      <p className="font-mono text-foreground mt-1">{textractDebug.textract_cells_count}</p>
                    </div>
                    {textractDebug.textract_warning && (
                      <div className="col-span-full">
                        <p className="text-amber-400 text-[10px] flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {textractDebug.textract_warning}
                        </p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Section 2: Parser Debug */}
            {parserDebug && (
              <Collapsible open={expandedSections.parser} onOpenChange={() => toggleSection('parser')}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-xs font-medium text-blue-300 hover:text-blue-200">
                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.parser ? '' : '-rotate-90'}`} />
                  <FileText className="h-3 w-3" />
                  2️⃣ DEBUG PARSER (v{parserDebug.parser_version})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-blue-500/10 rounded p-3">
                    <div>
                      <p className="text-muted-foreground">line_items_count</p>
                      <p className="font-mono text-foreground mt-1">{parserDebug.line_items_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">with_qty_count</p>
                      <p className={`font-mono mt-1 ${parserDebug.line_items_with_qty_count === 0 ? "text-red-400" : "text-foreground"}`}>
                        {parserDebug.line_items_with_qty_count}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">with_unit_count</p>
                      <p className="font-mono text-foreground mt-1">{parserDebug.line_items_with_unit_count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">detected_units_set</p>
                      <p className="font-mono text-foreground mt-1 text-[10px]">
                        [{parserDebug.detected_units_set?.join(', ') || "none"}]
                      </p>
                    </div>
                    {parserDebug.qty_parse_errors && parserDebug.qty_parse_errors.length > 0 && (
                      <div className="col-span-full">
                        <p className="text-muted-foreground mb-1">qty_parse_errors ({parserDebug.qty_parse_errors.length})</p>
                        <div className="max-h-20 overflow-y-auto bg-red-500/10 rounded p-2">
                          {parserDebug.qty_parse_errors.slice(0, 5).map((err, i) => (
                            <p key={i} className="text-red-400 text-[10px] font-mono">{err}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Section 3: qty_ref Debug - CRITICAL */}
            {qtyRefDebug && (
              <Collapsible open={expandedSections.qtyRef} onOpenChange={() => toggleSection('qtyRef')}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-xs font-medium text-emerald-300 hover:text-emerald-200">
                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.qtyRef ? '' : '-rotate-90'}`} />
                  <Target className="h-3 w-3" />
                  3️⃣ DEBUG QTY_REF
                  {qtyRefDebug.qty_ref_detected ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-400" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className={`rounded p-3 ${qtyRefDebug.qty_ref_detected ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">qty_ref_detected</p>
                        <Badge variant="outline" className={`mt-1 text-[10px] ${qtyRefDebug.qty_ref_detected ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                          {qtyRefDebug.qty_ref_detected ? "true" : "false"}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-muted-foreground">qty_ref_value</p>
                        <p className={`font-mono font-bold mt-1 ${qtyRefDebug.qty_ref_value ? "text-emerald-400" : "text-red-400"}`}>
                          {qtyRefDebug.qty_ref_value ?? "NULL"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">qty_ref_type</p>
                        <p className="font-mono text-foreground mt-1">{qtyRefDebug.qty_ref_type || "-"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">qty_ref_source</p>
                        <Badge variant="outline" className="mt-1 text-[10px]">{qtyRefDebug.qty_ref_source}</Badge>
                      </div>
                      
                      {/* V3.1: Job Type Info */}
                      {qtyRefDebug.job_type && (
                        <>
                          <div>
                            <p className="text-muted-foreground">job_type</p>
                            <Badge variant="outline" className="mt-1 text-[10px] bg-violet-500/20 text-violet-400 border-violet-500/30">
                              {qtyRefDebug.job_type}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-muted-foreground">job_type_confidence</p>
                            <Badge variant="outline" className={`mt-1 text-[10px] ${
                              qtyRefDebug.job_type_confidence === "high" ? "bg-emerald-500/20 text-emerald-400" :
                              qtyRefDebug.job_type_confidence === "medium" ? "bg-amber-500/20 text-amber-400" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {qtyRefDebug.job_type_confidence || "-"}
                            </Badge>
                          </div>
                          <div className="col-span-2">
                            <p className="text-muted-foreground">job_type_keywords</p>
                            <p className="font-mono text-[10px] text-violet-400 mt-1">
                              {qtyRefDebug.job_type_keywords?.join(", ") || "-"}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {qtyRefDebug.qty_ref_selection_rule && (
                      <div className="mt-3 p-2 bg-emerald-500/10 rounded">
                        <p className="text-[10px] text-muted-foreground">qty_ref_selection_rule</p>
                        <p className="text-xs text-emerald-400 font-mono">{qtyRefDebug.qty_ref_selection_rule}</p>
                      </div>
                    )}

                    {qtyRefDebug.qty_ref_failure_reason && (
                      <div className="mt-3 p-2 bg-red-500/20 rounded border border-red-500/30">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-red-400" />
                          qty_ref_failure_reason
                        </p>
                        <p className="text-xs text-red-400 font-mono mt-1">{qtyRefDebug.qty_ref_failure_reason}</p>
                      </div>
                    )}

                    {qtyRefDebug.qty_ref_candidates && qtyRefDebug.qty_ref_candidates.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] text-muted-foreground mb-2">qty_ref_candidates ({qtyRefDebug.qty_ref_candidates.length})</p>
                        <div className="space-y-1">
                          {qtyRefDebug.qty_ref_candidates.map((c, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] font-mono bg-muted/50 rounded px-2 py-1">
                              <span className="text-foreground font-bold">{c.value} {c.unit}</span>
                              <Badge variant="outline" className={`text-[9px] ${
                                c.source.startsWith("job_specific") ? "bg-violet-500/20 text-violet-400" : ""
                              }`}>{c.source}</Badge>
                              <span className="text-muted-foreground">conf: {(c.confidence * 100).toFixed(0)}%</span>
                              {c.evidence_line_id !== null && (
                                <span className="text-muted-foreground">line #{c.evidence_line_id}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* V3.1: Job Specific Matches */}
                    {qtyRefDebug.job_specific_matches && qtyRefDebug.job_specific_matches.length > 0 && (
                      <div className="mt-3 p-2 bg-violet-500/10 rounded border border-violet-500/20">
                        <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                          <Target className="h-3 w-3 text-violet-400" />
                          job_specific_matches ({qtyRefDebug.job_specific_matches.length})
                        </p>
                        <div className="space-y-1">
                          {qtyRefDebug.job_specific_matches.map((m, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] font-mono bg-violet-500/5 rounded px-2 py-1">
                              <span className="text-violet-400 font-bold">{m.value}</span>
                              <Badge variant="outline" className="text-[9px] bg-violet-500/20 text-violet-400">{m.source}</Badge>
                              <span className="text-muted-foreground truncate" title={m.line}>{m.line.substring(0, 50)}...</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Sample Lines */}
            {parserDebug?.sample_lines && parserDebug.sample_lines.length > 0 && (
              <Collapsible open={expandedSections.sampleLines} onOpenChange={() => toggleSection('sampleLines')}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.sampleLines ? '' : '-rotate-90'}`} />
                  <List className="h-3 w-3" />
                  sample_lines ({parserDebug.sample_lines.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="max-h-60 overflow-y-auto bg-muted/30 rounded p-2 space-y-2">
                    {parserDebug.sample_lines.map((line, i) => (
                      <div key={i} className="text-[10px] font-mono bg-background/50 rounded p-2 border border-border/50">
                        <p className="text-muted-foreground truncate" title={line.raw_line}>
                          raw: {line.raw_line.substring(0, 80)}...
                        </p>
                        <div className="grid grid-cols-4 gap-2 mt-1">
                          <span>qty: <span className={line.qty_value ? "text-emerald-400" : "text-red-400"}>{line.qty_value ?? "NULL"}</span></span>
                          <span>unit: <span className={line.unit_normalized ? "text-emerald-400" : "text-muted-foreground"}>{line.unit_normalized ?? "-"}</span></span>
                          <span>PU: {line.unit_price?.toFixed(2) ?? "-"}</span>
                          <span>Total: {line.total_price?.toFixed(2) ?? "-"}€</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Provider Calls */}
            {debugData?.provider_calls && debugData.provider_calls.length > 0 && (
              <Collapsible open={expandedSections.providerCalls} onOpenChange={() => toggleSection('providerCalls')}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className={`h-3 w-3 transition-transform ${expandedSections.providerCalls ? '' : '-rotate-90'}`} />
                  <Clock className="h-3 w-3" />
                  provider_calls ({debugData.provider_calls.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="space-y-1">
                    {debugData.provider_calls.map((call, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-mono bg-muted/50 rounded px-2 py-1">
                        <Badge variant="outline" className={`text-[10px] ${getProviderBadgeColor(call.provider)}`}>
                          {call.provider}
                        </Badge>
                        <span className={call.success ? "text-emerald-400" : "text-red-400"}>
                          {call.success ? "✓" : "✗"}
                        </span>
                        <span className="text-muted-foreground">{call.latency_ms}ms</span>
                        <span className="text-muted-foreground">pages: {call.pages_used}</span>
                        {call.error && (
                          <span className="text-red-400 truncate" title={call.error}>
                            {call.error}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </CardContent>
    </Card>
      )}
    </div>
  );
};
