import { LineChart } from "lucide-react";
import {
  AnalysesEvolutionChart,
  ScoreEvolutionChart,
  ScoreDistributionPieChart,
  UsersEvolutionChart,
} from "@/components/admin/AdminCharts";
import type { KPIs } from "@/types/admin";

interface ChartsSectionProps {
  kpis: KPIs;
}

export default function ChartsSection({ kpis }: ChartsSectionProps) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <LineChart className="h-5 w-5 text-primary" />
        Évolution temporelle
      </h2>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <AnalysesEvolutionChart 
          evolutionDaily={kpis.charts.evolution_daily} 
          evolutionWeekly={kpis.charts.evolution_weekly} 
        />
        <UsersEvolutionChart 
          evolutionDaily={kpis.charts.evolution_daily} 
          evolutionWeekly={kpis.charts.evolution_weekly} 
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <ScoreEvolutionChart 
          evolutionDaily={kpis.charts.evolution_daily} 
          evolutionWeekly={kpis.charts.evolution_weekly} 
        />
        <ScoreDistributionPieChart 
          scoreDistribution={kpis.charts.score_distribution} 
        />
      </div>
    </section>
  );
}
