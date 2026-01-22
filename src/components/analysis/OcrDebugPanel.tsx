import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bug, Database, Clock, FileDigit, Layers, Zap } from "lucide-react";

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
}

interface ProviderCall {
  provider: string;
  latency_ms: number;
  pages_used: number;
  success: boolean;
  error?: string;
}

interface OcrDebugPanelProps {
  analysisId: string;
}

export const OcrDebugPanel = ({ analysisId }: OcrDebugPanelProps) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [debugData, setDebugData] = useState<OcrDebugData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminAndFetchData = async () => {
      try {
        // Check admin status via RPC
        const { data: isAdminResult } = await supabase.rpc("is_admin");
        
        if (!isAdminResult) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        
        setIsAdmin(true);
        
        // Fetch extraction data for this analysis
        const { data: extraction, error } = await supabase
          .from("document_extractions")
          .select("provider, ocr_used, pages_used, pages_count, quality_score, cache_hit, file_hash, provider_calls, created_at")
          .eq("analysis_id", analysisId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        
        if (error) {
          console.log("No extraction data found:", error.message);
        } else {
          setDebugData(extraction as unknown as OcrDebugData);
        }
      } catch (err) {
        console.error("Error fetching OCR debug data:", err);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAndFetchData();
  }, [analysisId]);

  // Don't render anything for non-admins
  if (!isAdmin || loading) {
    return null;
  }

  // Calculate total latency from provider_calls
  const totalLatencyMs = debugData?.provider_calls?.reduce(
    (sum, call) => sum + (call.latency_ms || 0),
    0
  ) || 0;

  // Determine OCR reason based on provider_calls
  const getOcrReason = (): string => {
    if (!debugData?.provider_calls || debugData.provider_calls.length === 0) {
      return "no_data";
    }
    
    const pdfTextCall = debugData.provider_calls.find(c => c.provider === "pdf_text");
    const textractCall = debugData.provider_calls.find(c => c.provider === "textract");
    const lovableCall = debugData.provider_calls.find(c => c.provider === "lovable_ai");
    
    if (debugData.provider === "pdf_text") {
      return "pdf_text_ok";
    }
    
    if (pdfTextCall && !pdfTextCall.success) {
      return "pdf_text_failed";
    }
    
    if (textractCall && textractCall.success) {
      return pdfTextCall ? "pdf_text_low_quality" : "image_input";
    }
    
    if (lovableCall) {
      return textractCall?.error ? "textract_failed_fallback" : "forced_lovable";
    }
    
    return "unknown";
  };

  const getProviderBadgeColor = (provider: string) => {
    switch (provider) {
      case "pdf_text": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "textract": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "lovable_ai": return "bg-violet-500/20 text-violet-400 border-violet-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className="mt-6 border-dashed border-2 border-violet-500/30 bg-violet-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-violet-400">
          <Bug className="h-4 w-4" />
          Debug OCR (Admin)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!debugData ? (
          <p className="text-xs text-muted-foreground">Aucune donnée d'extraction trouvée pour cette analyse.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            {/* Provider */}
            <div className="flex items-start gap-2">
              <Zap className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-muted-foreground">ocr_provider</p>
                <Badge variant="outline" className={`mt-1 text-xs ${getProviderBadgeColor(debugData.provider)}`}>
                  {debugData.provider}
                </Badge>
              </div>
            </div>

            {/* OCR Reason */}
            <div className="flex items-start gap-2">
              <FileDigit className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-muted-foreground">ocr_reason</p>
                <p className="font-mono text-foreground mt-1">{getOcrReason()}</p>
              </div>
            </div>

            {/* Pages Used */}
            <div className="flex items-start gap-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-muted-foreground">pages_used</p>
                <p className="font-mono text-foreground mt-1">
                  {debugData.pages_used ?? "-"} / {debugData.pages_count ?? "-"}
                </p>
              </div>
            </div>

            {/* Cache Hit */}
            <div className="flex items-start gap-2">
              <Database className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-muted-foreground">cache_hit</p>
                <Badge 
                  variant="outline" 
                  className={`mt-1 text-xs ${debugData.cache_hit 
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                    : "bg-muted text-muted-foreground"}`}
                >
                  {debugData.cache_hit ? "true" : "false"}
                </Badge>
              </div>
            </div>

            {/* SHA-256 */}
            <div className="flex items-start gap-2 col-span-2 md:col-span-1">
              <FileDigit className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-muted-foreground">extraction_sha256</p>
                <p className="font-mono text-foreground mt-1 truncate" title={debugData.file_hash}>
                  {debugData.file_hash?.substring(0, 16)}...
                </p>
              </div>
            </div>

            {/* Total Latency */}
            <div className="flex items-start gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-muted-foreground">latency_ms_total</p>
                <p className="font-mono text-foreground mt-1">
                  {totalLatencyMs > 0 ? `${totalLatencyMs.toLocaleString()} ms` : "-"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Provider Calls Detail */}
        {debugData?.provider_calls && debugData.provider_calls.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-2">Provider Calls:</p>
            <div className="space-y-1">
              {debugData.provider_calls.map((call, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-2 text-xs font-mono bg-muted/50 rounded px-2 py-1"
                >
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] ${getProviderBadgeColor(call.provider)}`}
                  >
                    {call.provider}
                  </Badge>
                  <span className={call.success ? "text-emerald-400" : "text-red-400"}>
                    {call.success ? "✓" : "✗"}
                  </span>
                  <span className="text-muted-foreground">{call.latency_ms}ms</span>
                  {call.error && (
                    <span className="text-red-400 truncate" title={call.error}>
                      {call.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
