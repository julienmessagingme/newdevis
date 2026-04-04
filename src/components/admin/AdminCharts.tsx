import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EvolutionData {
  date?: string;
  week?: string;
  label: string;
  analyses: number;
  vert: number;
  orange: number;
  rouge: number;
  users: number;
}

interface ScoreDistribution {
  name: string;
  value: number;
  color: string;
}

interface AdminChartsProps {
  evolutionDaily: EvolutionData[];
  evolutionWeekly: EvolutionData[];
  scoreDistribution: ScoreDistribution[];
}

const COLORS = {
  vert: "#22c55e",
  orange: "#f97316",
  rouge: "#ef4444",
  primary: "hsl(var(--primary))",
  muted: "hsl(var(--muted-foreground))",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-foreground mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const AnalysesEvolutionChart = ({ evolutionDaily, evolutionWeekly }: Pick<AdminChartsProps, 'evolutionDaily' | 'evolutionWeekly'>) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Évolution des analyses</CardTitle>
        <CardDescription>Volume d'analyses dans le temps</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="daily">
          <TabsList className="mb-4">
            <TabsTrigger value="daily">30 derniers jours</TabsTrigger>
            <TabsTrigger value="weekly">12 dernières semaines</TabsTrigger>
          </TabsList>
          
          <TabsContent value="daily">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evolutionDaily}>
                  <defs>
                    <linearGradient id="colorAnalyses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 11 }} 
                    interval="preserveStartEnd"
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="analyses" 
                    name="Analyses"
                    stroke={COLORS.primary}
                    fillOpacity={1}
                    fill="url(#colorAnalyses)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          
          <TabsContent value="weekly">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolutionWeekly}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="analyses" 
                    name="Analyses"
                    fill={COLORS.primary}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export const ScoreEvolutionChart = ({ evolutionDaily, evolutionWeekly }: Pick<AdminChartsProps, 'evolutionDaily' | 'evolutionWeekly'>) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Évolution des scores</CardTitle>
        <CardDescription>Répartition VERT / ORANGE / ROUGE dans le temps</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="daily">
          <TabsList className="mb-4">
            <TabsTrigger value="daily">30 derniers jours</TabsTrigger>
            <TabsTrigger value="weekly">12 dernières semaines</TabsTrigger>
          </TabsList>
          
          <TabsContent value="daily">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evolutionDaily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 11 }} 
                    interval="preserveStartEnd"
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="vert" 
                    name="FEU VERT"
                    stackId="1"
                    stroke={COLORS.vert}
                    fill={COLORS.vert}
                    fillOpacity={0.6}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="orange" 
                    name="FEU ORANGE"
                    stackId="1"
                    stroke={COLORS.orange}
                    fill={COLORS.orange}
                    fillOpacity={0.6}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="rouge" 
                    name="FEU ROUGE"
                    stackId="1"
                    stroke={COLORS.rouge}
                    fill={COLORS.rouge}
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          
          <TabsContent value="weekly">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolutionWeekly}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="vert" name="FEU VERT" stackId="a" fill={COLORS.vert} />
                  <Bar dataKey="orange" name="FEU ORANGE" stackId="a" fill={COLORS.orange} />
                  <Bar dataKey="rouge" name="FEU ROUGE" stackId="a" fill={COLORS.rouge} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export const ScoreDistributionPieChart = ({ scoreDistribution }: Pick<AdminChartsProps, 'scoreDistribution'>) => {
  const RADIAN = Math.PI / 180;
  
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="text-xs font-semibold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Distribution des scores</CardTitle>
        <CardDescription>Répartition globale des analyses</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={scoreDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {scoreDistribution.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.name === "FEU VERT" ? COLORS.vert : entry.name === "FEU ORANGE" ? COLORS.orange : COLORS.rouge} 
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export const UsersEvolutionChart = ({ evolutionDaily, evolutionWeekly }: Pick<AdminChartsProps, 'evolutionDaily' | 'evolutionWeekly'>) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Utilisateurs actifs</CardTitle>
        <CardDescription>Nombre d'utilisateurs uniques par période</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="daily">
          <TabsList className="mb-4">
            <TabsTrigger value="daily">30 derniers jours</TabsTrigger>
            <TabsTrigger value="weekly">12 dernières semaines</TabsTrigger>
          </TabsList>
          
          <TabsContent value="daily">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionDaily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 11 }} 
                    interval="preserveStartEnd"
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="users" 
                    name="Utilisateurs"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    dot={{ fill: COLORS.primary, strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          
          <TabsContent value="weekly">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolutionWeekly}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="users" 
                    name="Utilisateurs"
                    fill={COLORS.primary}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
