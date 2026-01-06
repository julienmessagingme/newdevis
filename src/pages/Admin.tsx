import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Shield, 
  Search,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  Eye,
  MessageSquare,
  Settings,
  Users,
  BarChart3,
  LogOut
} from "lucide-react";

// Mock data for admin
const mockAdminAnalyses = [
  {
    id: 1,
    title: "Devis Plomberie - Salle de bain",
    user: "Jean Dupont",
    email: "jean.dupont@email.com",
    company: "Plomberie Martin SARL",
    date: "06/01/2026",
    amount: "4 500 €",
    score: "green",
    autoScore: 85,
    status: "completed"
  },
  {
    id: 2,
    title: "Devis Électricité - Rénovation",
    user: "Marie Lefebvre",
    email: "marie.l@email.com",
    company: "Elec Pro Services",
    date: "05/01/2026",
    amount: "8 200 €",
    score: "orange",
    autoScore: 62,
    status: "completed"
  },
  {
    id: 3,
    title: "Devis Peinture - Appartement",
    user: "Pierre Martin",
    email: "p.martin@email.com",
    company: "Peintures Dubois",
    date: "04/01/2026",
    amount: "2 800 €",
    score: "red",
    autoScore: 35,
    status: "review"
  },
  {
    id: 4,
    title: "Devis Toiture - Maison",
    user: "Sophie Bernard",
    email: "s.bernard@email.com",
    company: "Toitures Express",
    date: "06/01/2026",
    amount: "12 500 €",
    score: "pending",
    autoScore: null,
    status: "processing"
  }
];

const stats = [
  { label: "Analyses aujourd'hui", value: "24", icon: FileText, trend: "+12%" },
  { label: "Score moyen", value: "72", icon: BarChart3, trend: "+3%" },
  { label: "Utilisateurs actifs", value: "156", icon: Users, trend: "+8%" },
  { label: "En attente revue", value: "3", icon: Clock, trend: "-2" }
];

const getScoreIcon = (score: string) => {
  switch (score) {
    case "green": return <CheckCircle2 className="h-5 w-5 text-score-green" />;
    case "orange": return <AlertCircle className="h-5 w-5 text-score-orange" />;
    case "red": return <XCircle className="h-5 w-5 text-score-red" />;
    default: return <Clock className="h-5 w-5 text-muted-foreground animate-pulse" />;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "completed":
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-score-green-bg text-score-green-foreground">Terminé</span>;
    case "review":
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-score-orange-bg text-score-orange-foreground">À revoir</span>;
    case "processing":
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">En cours</span>;
    default:
      return null;
  }
};

const Admin = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const filteredAnalyses = mockAdminAnalyses.filter(analysis => {
    if (activeTab === "review" && analysis.status !== "review") return false;
    if (activeTab === "processing" && analysis.status !== "processing") return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        analysis.title.toLowerCase().includes(query) ||
        analysis.user.toLowerCase().includes(query) ||
        analysis.company.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">Yukartisan</span>
            <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
              Admin
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
            <Link to="/">
              <Button variant="ghost" size="icon">
                <LogOut className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, index) => (
            <div key={index} className="bg-card border border-border rounded-xl p-4 card-shadow">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className="h-5 w-5 text-muted-foreground" />
                <span className={`text-xs font-medium ${stat.trend.startsWith('+') ? 'text-score-green' : 'text-muted-foreground'}`}>
                  {stat.trend}
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, entreprise, utilisateur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button 
              variant={activeTab === "all" ? "default" : "outline"}
              onClick={() => setActiveTab("all")}
            >
              Tous
            </Button>
            <Button 
              variant={activeTab === "review" ? "default" : "outline"}
              onClick={() => setActiveTab("review")}
            >
              À revoir
            </Button>
            <Button 
              variant={activeTab === "processing" ? "default" : "outline"}
              onClick={() => setActiveTab("processing")}
            >
              En cours
            </Button>
          </div>
        </div>

        {/* Analyses Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden card-shadow">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Devis</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Utilisateur</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Montant</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Score Auto</th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground">Statut</th>
                  <th className="text-right p-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAnalyses.map((analysis) => (
                  <tr key={analysis.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <div>
                        <p className="font-medium text-foreground">{analysis.title}</p>
                        <p className="text-sm text-muted-foreground">{analysis.company}</p>
                        <p className="text-xs text-muted-foreground">{analysis.date}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-foreground">{analysis.user}</p>
                      <p className="text-sm text-muted-foreground">{analysis.email}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-foreground">{analysis.amount}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        {getScoreIcon(analysis.score)}
                        <span className="font-medium text-foreground">
                          {analysis.autoScore ?? "-"}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(analysis.status)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Admin;
