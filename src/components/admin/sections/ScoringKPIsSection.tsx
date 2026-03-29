import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart3, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import type { KPIs } from "@/types/admin";

interface ScoringKPIsSectionProps {
  kpis: KPIs;
}

export default function ScoringKPIsSection({ kpis }: ScoringKPIsSectionProps) {
  const totalScored = kpis.scoring.score_vert + kpis.scoring.score_orange + kpis.scoring.score_rouge;

  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        KPIs de scoring
      </h2>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Score distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Répartition des scores</CardTitle>
            <CardDescription>Distribution FEU VERT / ORANGE / ROUGE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-32">
                  <CheckCircle2 className="h-5 w-5 text-score-green" />
                  <span className="text-sm font-medium">FEU VERT</span>
                </div>
                <div className="flex-1">
                  <Progress 
                    value={kpis.scoring.pct_vert} 
                    className="h-4"
                    style={{ 
                      ["--progress-background" as string]: "hsl(var(--score-green))"
                    }}
                  />
                </div>
                <span className="text-sm font-bold w-20 text-right">
                  {kpis.scoring.score_vert} ({kpis.scoring.pct_vert}%)
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-32">
                  <AlertCircle className="h-5 w-5 text-score-orange" />
                  <span className="text-sm font-medium">FEU ORANGE</span>
                </div>
                <div className="flex-1">
                  <Progress 
                    value={kpis.scoring.pct_orange} 
                    className="h-4"
                    style={{ 
                      ["--progress-background" as string]: "hsl(var(--score-orange))"
                    }}
                  />
                </div>
                <span className="text-sm font-bold w-20 text-right">
                  {kpis.scoring.score_orange} ({kpis.scoring.pct_orange}%)
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-32">
                  <XCircle className="h-5 w-5 text-score-red" />
                  <span className="text-sm font-medium">FEU ROUGE</span>
                </div>
                <div className="flex-1">
                  <Progress 
                    value={kpis.scoring.pct_rouge} 
                    className="h-4"
                    style={{ 
                      ["--progress-background" as string]: "hsl(var(--score-red))"
                    }}
                  />
                </div>
                <span className="text-sm font-bold w-20 text-right">
                  {kpis.scoring.score_rouge} ({kpis.scoring.pct_rouge}%)
                </span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Total analysé : <strong className="text-foreground">{totalScored}</strong> devis
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Alerts analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Principaux critères déclencheurs</CardTitle>
            <CardDescription>Classement par fréquence d'apparition</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {kpis.alerts.top_alerts.length > 0 ? (
                kpis.alerts.top_alerts.map((alert, index) => (
                  <div key={alert.category} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-6">
                      #{index + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{alert.category}</span>
                        <span className="text-xs text-muted-foreground">{alert.count}x</span>
                      </div>
                      <Progress value={alert.percentage} className="h-2" />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Aucune donnée disponible</p>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-border grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Moyenne alertes/devis</p>
                <p className="text-lg font-bold text-foreground">{kpis.alerts.avg_alerts_per_analysis}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sans critère critique</p>
                <p className="text-lg font-bold text-score-green">{kpis.alerts.pct_without_critical}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
