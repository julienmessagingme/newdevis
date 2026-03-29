import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bell, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import type { KPIs } from "@/types/admin";

interface BusinessKPIsSectionProps {
  kpis: KPIs;
}

export default function BusinessKPIsSection({ kpis }: BusinessKPIsSectionProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        KPIs business & engagement
      </h2>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Consent & Communication */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Consentement & communication</CardTitle>
            <CardDescription>Suivi post-signature</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Taux consentement</p>
                <p className="text-2xl font-bold text-foreground">{kpis.tracking.consent_rate}%</p>
                <p className="text-xs text-muted-foreground">
                  {kpis.tracking.consent_given} / {kpis.tracking.total_entries}
                </p>
              </div>

              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Activation WhatsApp</p>
                <p className="text-2xl font-bold text-foreground">{kpis.tracking.whatsapp_rate}%</p>
                <p className="text-xs text-muted-foreground">
                  {kpis.tracking.whatsapp_enabled} utilisateurs
                </p>
              </div>

              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Devis signés</p>
                <p className="text-2xl font-bold text-score-green">{kpis.tracking.signed_quotes}</p>
              </div>

              <div className="bg-accent/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Réponses reçues</p>
                <p className="text-2xl font-bold text-foreground">{kpis.tracking.responses_received}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Work Status (declarative) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Statut des travaux (déclaratif)</CardTitle>
            <CardDescription>Réponses utilisateurs sur l'avancement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <CheckCircle2 className="h-5 w-5 text-score-green" />
                  <span className="text-sm font-medium">Travaux terminés</span>
                </div>
                <span className="text-lg font-bold text-score-green">
                  {kpis.tracking.status_completed}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <Clock className="h-5 w-5 text-score-orange" />
                  <span className="text-sm font-medium">En cours</span>
                </div>
                <span className="text-lg font-bold text-score-orange">
                  {kpis.tracking.status_in_progress}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Non réalisés / Retard</span>
                </div>
                <span className="text-lg font-bold text-muted-foreground">
                  {kpis.tracking.status_delayed}
                </span>
              </div>
            </div>

            <div className="mt-6 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                ⚠️ Ces données sont déclaratives et ne permettent pas de conclure 
                à un manquement de l'artisan.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
