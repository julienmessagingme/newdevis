import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  Plus, 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  XCircle,
  LogOut,
  User,
  Settings
} from "lucide-react";

// Mock data for demonstration
const mockAnalyses = [
  {
    id: 1,
    title: "Devis Plomberie - Salle de bain",
    company: "Plomberie Martin SARL",
    date: "06/01/2026",
    amount: "4 500 €",
    score: "green",
    status: "Analysé"
  },
  {
    id: 2,
    title: "Devis Électricité - Rénovation",
    company: "Elec Pro Services",
    date: "04/01/2026",
    amount: "8 200 €",
    score: "orange",
    status: "Analysé"
  },
  {
    id: 3,
    title: "Devis Peinture - Appartement",
    company: "Peintures Dubois",
    date: "02/01/2026",
    amount: "2 800 €",
    score: "red",
    status: "Analysé"
  },
  {
    id: 4,
    title: "Devis Toiture",
    company: "En cours d'analyse...",
    date: "06/01/2026",
    amount: "-",
    score: "pending",
    status: "En cours"
  }
];

const getScoreIcon = (score: string) => {
  switch (score) {
    case "green":
      return <CheckCircle2 className="h-5 w-5 text-score-green" />;
    case "orange":
      return <AlertCircle className="h-5 w-5 text-score-orange" />;
    case "red":
      return <XCircle className="h-5 w-5 text-score-red" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground animate-pulse" />;
  }
};

const getScoreBadge = (score: string) => {
  switch (score) {
    case "green":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-green-bg text-score-green-foreground">
          <span className="w-2 h-2 bg-score-green rounded-full" />
          Feu Vert
        </span>
      );
    case "orange":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-orange-bg text-score-orange-foreground">
          <span className="w-2 h-2 bg-score-orange rounded-full" />
          Feu Orange
        </span>
      );
    case "red":
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-score-red-bg text-score-red-foreground">
          <span className="w-2 h-2 bg-score-red rounded-full" />
          Feu Rouge
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" />
          En cours
        </span>
      );
  }
};

const Dashboard = () => {
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
          </Link>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="hidden md:block text-sm font-medium">Jean Dupont</span>
            </div>
            <Link to="/">
              <Button variant="ghost" size="icon">
                <LogOut className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Bonjour Jean 👋
          </h1>
          <p className="text-muted-foreground">
            Gérez vos analyses de devis et suivez leur évolution
          </p>
        </div>

        {/* Quick Action */}
        <Link to="/nouvelle-analyse" className="block mb-8">
          <div className="bg-card border-2 border-dashed border-primary/30 rounded-2xl p-6 hover:border-primary hover:bg-accent/50 transition-all duration-200 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <Plus className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Analyser un nouveau devis
                </h2>
                <p className="text-sm text-muted-foreground">
                  Téléversez un devis PDF ou photo pour obtenir votre score
                </p>
              </div>
            </div>
          </div>
        </Link>

        {/* Analyses List */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              Mes analyses
            </h2>
            <span className="text-sm text-muted-foreground">
              {mockAnalyses.length} devis analysés
            </span>
          </div>

          <div className="space-y-4">
            {mockAnalyses.map((analysis) => (
              <Link 
                key={analysis.id} 
                to={analysis.score !== "pending" ? `/analyse/${analysis.id}` : "#"}
                className={`block ${analysis.score === "pending" ? "cursor-wait" : ""}`}
              >
                <div className="bg-card border border-border rounded-xl p-4 md:p-6 card-shadow hover:card-shadow-lg transition-all duration-200">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center flex-shrink-0">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground truncate">
                          {analysis.title}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {analysis.company}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 md:gap-8">
                      <div className="text-left md:text-right">
                        <p className="font-semibold text-foreground">{analysis.amount}</p>
                        <p className="text-xs text-muted-foreground">{analysis.date}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {getScoreBadge(analysis.score)}
                        {getScoreIcon(analysis.score)}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
