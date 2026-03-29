import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Users, Calendar, TrendingUp, BarChart3 } from "lucide-react";
import type { KPIs } from "@/types/admin";

interface UsageKPIsSectionProps {
  kpis: KPIs;
}

export default function UsageKPIsSection({ kpis }: UsageKPIsSectionProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        KPIs d'usage
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Utilisateurs uniques</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{kpis.usage.total_users}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Devis déposés</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{kpis.usage.total_analyses}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Analyses réussies</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-score-green">{kpis.usage.completed_analyses}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Taux de complétion</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{kpis.usage.completion_rate}%</p>
            <Progress value={kpis.usage.completion_rate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Moyenne / utilisateur</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{kpis.usage.avg_analyses_per_user}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>En erreur</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-score-red">{kpis.usage.error_analyses}</p>
          </CardContent>
        </Card>
      </div>

      {/* Time-based analytics */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <Card className="bg-primary/5">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Aujourd'hui</p>
              <p className="text-2xl font-bold text-foreground">{kpis.time_analytics.today}</p>
            </div>
            <Calendar className="h-8 w-8 text-primary/50" />
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Cette semaine</p>
              <p className="text-2xl font-bold text-foreground">{kpis.time_analytics.this_week}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-primary/50" />
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Ce mois</p>
              <p className="text-2xl font-bold text-foreground">{kpis.time_analytics.this_month}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-primary/50" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
