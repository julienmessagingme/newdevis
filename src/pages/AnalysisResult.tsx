import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  ArrowLeft, 
  Download,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Building2,
  FileText,
  ShieldCheck,
  TrendingUp,
  Calendar,
  MapPin,
  Phone,
  ExternalLink
} from "lucide-react";

// Mock data for demonstration
const mockAnalysis = {
  id: 1,
  title: "Devis Plomberie - Salle de bain",
  uploadDate: "06/01/2026",
  company: {
    name: "Plomberie Martin SARL",
    siren: "123 456 789",
    address: "12 rue des Artisans, 75001 Paris",
    phone: "01 23 45 67 89",
    createdDate: "15/03/2018",
    yearsOld: 8
  },
  quote: {
    amount: "4 500 €",
    amountHT: "3 750 €",
    tva: "750 €",
    validUntil: "06/02/2026"
  },
  score: "green",
  overallScore: 85,
  categories: [
    {
      id: "company",
      name: "Analyse Entreprise",
      icon: Building2,
      score: "green",
      points: 22,
      maxPoints: 25,
      details: [
        { label: "SIREN/SIRET vérifié", status: "green", detail: "Entreprise inscrite au RCS" },
        { label: "Ancienneté", status: "green", detail: "8 ans d'existence (> 5 ans)" },
        { label: "Santé financière", status: "green", detail: "Capitaux propres positifs" },
        { label: "Procédures collectives", status: "green", detail: "Aucune procédure en cours" }
      ]
    },
    {
      id: "quote",
      name: "Analyse Devis",
      icon: FileText,
      score: "green",
      points: 23,
      maxPoints: 25,
      details: [
        { label: "Mentions légales", status: "green", detail: "Toutes les mentions obligatoires présentes" },
        { label: "Cohérence TVA", status: "green", detail: "Calcul HT/TVA/TTC correct" },
        { label: "Détail prestations", status: "green", detail: "Prestations détaillées ligne par ligne" },
        { label: "Conditions paiement", status: "orange", detail: "Acompte de 50% demandé (élevé)" }
      ]
    },
    {
      id: "insurance",
      name: "Analyse Garanties",
      icon: ShieldCheck,
      score: "green",
      points: 20,
      maxPoints: 25,
      details: [
        { label: "Assurance décennale", status: "green", detail: "Attestation valide jusqu'au 31/12/2026" },
        { label: "Assureur identifié", status: "green", detail: "AXA France IARD" },
        { label: "Couverture travaux", status: "green", detail: "Travaux de plomberie couverts" },
        { label: "RC Professionnelle", status: "orange", detail: "Non mentionnée sur le devis" }
      ]
    },
    {
      id: "price",
      name: "Analyse Prix",
      icon: TrendingUp,
      score: "green",
      points: 20,
      maxPoints: 25,
      details: [
        { label: "Prix global", status: "green", detail: "Dans la moyenne du marché" },
        { label: "Main d'œuvre", status: "green", detail: "Tarif horaire cohérent (45€/h)" },
        { label: "Fournitures", status: "green", detail: "Prix des matériaux conformes" },
        { label: "Marge", status: "green", detail: "Marge raisonnable estimée" }
      ]
    }
  ],
  recommendations: [
    "Demandez une attestation de RC Professionnelle avant le début des travaux",
    "Négociez un acompte de 30% maximum plutôt que 50%",
    "Conservez ce devis signé comme preuve en cas de litige"
  ]
};

const getScoreIcon = (score: string, className: string = "h-5 w-5") => {
  switch (score) {
    case "green": return <CheckCircle2 className={`${className} text-score-green`} />;
    case "orange": return <AlertCircle className={`${className} text-score-orange`} />;
    case "red": return <XCircle className={`${className} text-score-red`} />;
    default: return null;
  }
};

const getScoreLabel = (score: string) => {
  switch (score) {
    case "green": return "FEU VERT";
    case "orange": return "FEU ORANGE";
    case "red": return "FEU ROUGE";
    default: return "-";
  }
};

const AnalysisResult = () => {
  const { id } = useParams();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">VerifierMonDevis.fr</span>
          </Link>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Télécharger le rapport
          </Button>
        </div>
      </header>

      <main className="container py-8 max-w-4xl">
        {/* Back Button */}
        <Link 
          to="/tableau-de-bord" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au tableau de bord
        </Link>

        {/* Score Hero */}
        <div className="bg-score-green-bg border-2 border-score-green/30 rounded-2xl p-6 md:p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Score de fiabilité
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-score-green flex items-center gap-3">
                {getScoreIcon(mockAnalysis.score, "h-8 w-8")}
                {getScoreLabel(mockAnalysis.score)}
              </h1>
            </div>
            <div className="text-center md:text-right">
              <div className="text-5xl md:text-6xl font-bold text-score-green">
                {mockAnalysis.overallScore}
              </div>
              <p className="text-sm text-muted-foreground">sur 100</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="h-3 bg-background/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-score-green rounded-full transition-all duration-1000"
                style={{ width: `${mockAnalysis.overallScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Quote & Company Info */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Quote Info */}
          <div className="bg-card border border-border rounded-xl p-6 card-shadow">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Devis analysé
            </h2>
            <div className="space-y-3">
              <p className="text-lg font-medium text-foreground">{mockAnalysis.title}</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Montant TTC</p>
                  <p className="font-semibold text-foreground">{mockAnalysis.quote.amount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Montant HT</p>
                  <p className="font-medium text-foreground">{mockAnalysis.quote.amountHT}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">TVA</p>
                  <p className="font-medium text-foreground">{mockAnalysis.quote.tva}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Validité</p>
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {mockAnalysis.quote.validUntil}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Company Info */}
          <div className="bg-card border border-border rounded-xl p-6 card-shadow">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Entreprise
            </h2>
            <div className="space-y-3">
              <p className="text-lg font-medium text-foreground">{mockAnalysis.company.name}</p>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  SIREN : <span className="text-foreground">{mockAnalysis.company.siren}</span>
                </p>
                <p className="text-muted-foreground flex items-start gap-1">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="text-foreground">{mockAnalysis.company.address}</span>
                </p>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  <span className="text-foreground">{mockAnalysis.company.phone}</span>
                </p>
                <p className="text-muted-foreground">
                  Créée le : <span className="text-foreground">{mockAnalysis.company.createdDate}</span>
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-score-green-bg text-score-green-foreground">
                    {mockAnalysis.company.yearsOld} ans
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Analysis */}
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Analyse détaillée
        </h2>
        <div className="space-y-4 mb-8">
          {mockAnalysis.categories.map((category) => (
            <div key={category.id} className="bg-card border border-border rounded-xl overflow-hidden card-shadow">
              {/* Category Header */}
              <div className="p-4 md:p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <category.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{category.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {category.points}/{category.maxPoints} points
                    </p>
                  </div>
                </div>
                {getScoreIcon(category.score, "h-6 w-6")}
              </div>

              {/* Category Details */}
              <div className="p-4 md:p-6 space-y-3">
                {category.details.map((detail, index) => (
                  <div key={index} className="flex items-start gap-3">
                    {getScoreIcon(detail.status)}
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{detail.label}</p>
                      <p className="text-sm text-muted-foreground">{detail.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Recommendations */}
        <div className="bg-accent/50 border border-border rounded-xl p-6 mb-8">
          <h2 className="font-semibold text-foreground mb-4">
            Nos recommandations
          </h2>
          <ul className="space-y-3">
            {mockAnalysis.recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium text-primary">
                  {index + 1}
                </span>
                <p className="text-foreground">{rec}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-center text-muted-foreground mb-8">
          Cette analyse est fournie à titre informatif et ne constitue pas un conseil juridique. 
          Les informations sont basées sur les données publiques disponibles et l'analyse automatique du devis fourni.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="outline" size="lg">
            <ExternalLink className="h-4 w-4 mr-2" />
            Consulter Pappers
          </Button>
          <Link to="/nouvelle-analyse">
            <Button size="lg">
              Analyser un autre devis
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default AnalysisResult;
