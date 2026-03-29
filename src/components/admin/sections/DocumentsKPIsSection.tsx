import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { FileText, Building2, Clock, XCircle } from "lucide-react";
import type { KPIs } from "@/types/admin";

interface DocumentsKPIsSectionProps {
  kpis: KPIs;
}

export default function DocumentsKPIsSection({ kpis }: DocumentsKPIsSectionProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        KPIs documents
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <CardDescription>Devis travaux</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{kpis.documents.devis_travaux}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.documents.total > 0 
                ? Math.round((kpis.documents.devis_travaux / kpis.documents.total) * 100)
                : 0}% du total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <CardDescription>Diagnostics immobiliers</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{kpis.documents.devis_diagnostic}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.documents.total > 0 
                ? Math.round((kpis.documents.devis_diagnostic / kpis.documents.total) * 100)
                : 0}% du total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardDescription>Prestations techniques</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{kpis.documents.devis_prestation_technique}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.documents.total > 0 
                ? Math.round((kpis.documents.devis_prestation_technique / kpis.documents.total) * 100)
                : 0}% du total
            </p>
          </CardContent>
        </Card>

        <Card className="border-score-red/30">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-score-red" />
              <CardDescription>Documents refusés</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-score-red">{kpis.documents.documents_refuses}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Factures + non conformes
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
