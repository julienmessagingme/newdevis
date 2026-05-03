import { useEffect, useState } from "react";
import {
  Bot,
  ArrowLeft,
  Brain,
  Search,
  PenLine,
  Image as ImageIcon,
  ShieldCheck,
  Send,
  ExternalLink,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AdminLoading, AdminAccessDenied } from "@/components/admin/sections/AdminGuards";

/**
 * Page lecture-only qui décrit ce que font les 5 agents IA + le pseudo-publisher V1.
 * Utile pour Julien qui ne contrôle pas tout depuis le dashboard mais veut comprendre
 * ce qui tourne sous le capot — modèles, rôles, coûts, ce qui est fait/pas fait.
 *
 * Source de vérité : agents/src/agents/*.py + agents/src/prompts/*.system.md
 * + agents/src/lib/llm_factory.py côté repo gerermonchantier-marketing.
 */

interface AgentCard {
  id: string;
  name: string;
  emoji: string;
  Icon: typeof Brain;
  llm: string;
  llmShort: string;
  llmCostHint: string;
  role: string;
  description: string;
  inputs: string[];
  outputs: string[];
  tools: string[];
  doesNot: string[];
  costPerRun: string;
  promptFile: string;
  agentFile: string;
}

const AGENTS: AgentCard[] = [
  {
    id: "strategist",
    name: "Strategist",
    emoji: "🎯",
    Icon: Brain,
    llm: "Claude Sonnet 4.7 (Anthropic)",
    llmShort: "Sonnet 4.7",
    llmCostHint: "$3 input / $15 output (par 1M tokens)",
    role: "Cerveau éditorial. Décide quoi raconter, à qui, sur quelle plateforme.",
    description:
      "Tire chaque jour : 1 angle dans la bibliothèque A-F, 1 persona cible, 1 plateforme (FB/IG/TikTok), 1 CTA target (vmd / gmc / mpr_simulator / calculator). Respecte le ratio cible 70% GMC / 30% VMD sur 7 jours (pilotable depuis Réglages). 3 variantes de hook proposées.",
    inputs: [
      "Brand voice complète (BRAND_VOICE.md)",
      "Catalogue produit (FEATURES_FOR_AGENTS.md)",
      "Réglages dynamiques (gmc_ratio_pct depuis DB)",
      "Personas actifs (DB)",
      "Learnings validés (DB, confidence ≥ 0.7) — alimentés par Analyst V2",
      "KPIs récents par plateforme (DB)",
      "Liste des 7 derniers posts publiés (pour équilibre 70/30)",
    ],
    outputs: ["CampaignBrief JSON : persona + platform + angle + 3 hooks + cta_target + rationale"],
    tools: [
      "get_brand_voice",
      "get_features_catalog",
      "get_marketing_settings",
      "get_persona",
      "get_platform_kpis",
      "list_recent_learnings",
      "list_active_campaigns",
      "list_published_posts",
      "check_kill_switch",
    ],
    doesNot: [
      "N'écrit pas le contenu (c'est le Copywriter)",
      "Ne génère pas d'images (c'est le Visual Director)",
      "Ne publie pas (c'est manuel V1, ou bouton 1-click V1.5)",
    ],
    costPerRun: "~$0.10 (5-15k tokens input + 1-2k output, dépend du contexte chargé)",
    promptFile: "agents/src/prompts/strategist.system.md",
    agentFile: "agents/src/agents/strategist.py",
  },
  {
    id: "researcher",
    name: "Researcher",
    emoji: "🔍",
    Icon: Search,
    llm: "Claude Haiku 4.5 (fallback car GEMINI_API_KEY vide en V1)",
    llmShort: "Haiku 4.5 (fallback)",
    llmCostHint: "$0.80 input / $4 output — bon marché",
    role: "Génère 3-5 verbatims plausibles qui résonnent avec l'angle + persona.",
    description:
      "En V1 : utilise des fixtures (verbatims plausibles inventés à partir de la brand voice et du persona — pas de vrai scrap web). Quand Tavily sera activé (V2), il scrappera Reddit/forum-construire/etc. pour chercher de vraies citations utilisateur. Il identifie aussi les patterns récurrents et les mots-clés qui reviennent.",
    inputs: ["CampaignBrief du Strategist", "Brand voice", "Catalogue features", "Persona cible (détails DB)"],
    outputs: ["ResearchPack JSON : verbatims[] + common_patterns[] + keywords_used[]"],
    tools: ["get_brand_voice", "get_features_catalog", "get_persona"],
    doesNot: [
      "En V1 : ne fait PAS de vrai web search (mode fixtures)",
      "Ne valide pas la véracité des verbatims (les fixtures sont des plausibles, pas des vraies citations sourcées)",
    ],
    costPerRun: "~$0.01 (court contexte, output structuré)",
    promptFile: "agents/src/prompts/researcher.system.md",
    agentFile: "agents/src/agents/researcher.py",
  },
  {
    id: "copywriter",
    name: "Copywriter",
    emoji: "✍️",
    Icon: PenLine,
    llm: "Claude Sonnet 4.7 (Anthropic)",
    llmShort: "Sonnet 4.7",
    llmCostHint: "$3 input / $15 output — qualité littéraire prioritaire",
    role: "Produit le carrousel complet : cover + 6-9 slides + caption + 3 hashtags + CTA.",
    description:
      "Construit le contenu rédactionnel intégral. Adapte la slide CTA selon cta_target : URL classique (avec UTM tracking) pour VMD/Calculatrice, ou comment trigger 'CHANTIER' (mécanique waitlist GMC via bot DM messagingme.app) pour GMC/MPR. Utilise les verbatims du Researcher pour ancrer le propos. Vérifie l'absence de mots interdits avant de retourner.",
    inputs: ["CampaignBrief du Strategist", "ResearchPack du Researcher", "Brand voice", "Catalogue features", "Persona"],
    outputs: ["CarouselDraft JSON : hook + slides[] + caption + hashtags[] + cta + cta_url + self_quality_score"],
    tools: [
      "get_brand_voice",
      "get_features_catalog",
      "get_persona",
      "build_utm_url (uniquement pour VMD/Calc)",
      "check_forbidden_words",
      "create_post_draft",
    ],
    doesNot: [
      "Ne valide pas la qualité finale (c'est le Quality Gate)",
      "Ne génère pas les visuels (c'est le Visual Director)",
      "Ne construit pas d'URL pour GMC/MPR (cta_url='' — c'est un comment trigger)",
    ],
    costPerRun: "~$0.10-0.15 (10-25k tokens input avec brand voice + research, 2-4k output)",
    promptFile: "agents/src/prompts/copywriter.system.md",
    agentFile: "agents/src/agents/copywriter.py",
  },
  {
    id: "visual-director",
    name: "Visual Director",
    emoji: "🎨",
    Icon: ImageIcon,
    llm: "GPT-4o (OpenAI) pour le reasoning + gpt-image-1 pour générer les illustrations",
    llmShort: "GPT-4o + gpt-image-1",
    llmCostHint: "$2.5 input / $10 output (4o) + ~$0.04 par image (gpt-image-1)",
    role: "Génère un PNG par slide. Upload sur Backblaze B2. Persiste en DB.",
    description:
      "Pour chaque slide du carrousel produit par le Copywriter, choisit la méthode selon visual_type : (a) typography → rendu HTML+Playwright (1 des 4 templates : hook, stat-choc, twist, cta). Coût LLM : 0, juste du rendering local. (b) illustration → rédige un prompt artistique pour gpt-image-1 et appelle l'API OpenAI. Coût ~$0.04/image. Upload chaque PNG sur B2, persiste l'URL dans marketing.assets.",
    inputs: ["CarouselDraft du Copywriter", "Brand voice (palette + style)"],
    outputs: ["GeneratedAssets JSON : pour chaque slide → asset_id + public_url B2 + dimensions"],
    tools: [
      "get_brand_voice",
      "render_typography_slide (Playwright + Jinja2)",
      "generate_illustration (gpt-image-1)",
      "upload_to_b2",
      "save_asset",
    ],
    doesNot: [
      "Ne décide pas quel slide est typo vs illustration (c'est le Copywriter qui le pose dans visual_type)",
      "Ne touche pas au contenu textuel (juste le rendu visuel)",
    ],
    costPerRun: "~$0.30-0.50 (8 slides : ~6 typo gratuits + 2 illustrations gpt-image-1 + reasoning GPT-4o)",
    promptFile: "agents/src/prompts/visual_director.system.md",
    agentFile: "agents/src/agents/visual_director.py",
  },
  {
    id: "quality-gate",
    name: "Quality Gate",
    emoji: "✅",
    Icon: ShieldCheck,
    llm: "Claude Haiku 4.5 (Anthropic)",
    llmShort: "Haiku 4.5",
    llmCostHint: "$0.80 input / $4 output — rapide + pas cher",
    role: "Applique la checklist 12 points BRAND_VOICE.md. APPROVED ou REJECTED.",
    description:
      "Dernier rempart avant publication. Vérifie 12 points : hook punchy, vocabulaire interdit, tutoiement, pas de concurrent nommé, persona adressé, complicité, CTA cohérent avec routing 70/30, UTM présents (ou comment trigger CHANTIER pour GMC/MPR), 3 hashtags max, #GérerMonChantier présent, features réelles, pas d'affirmations interdites. Score sur 12. Seuil APPROVED dynamique (défaut 10/12, pilotable depuis Réglages).",
    inputs: ["CarouselDraft + GeneratedAssets", "Brand voice + features", "Réglages (quality_threshold)"],
    outputs: [
      "QualityVerdict JSON : score + passed_checks[] + failed_checks[] + decision (APPROVED/REJECTED) + corrections[]",
    ],
    tools: [
      "get_brand_voice",
      "get_features_catalog",
      "get_marketing_settings",
      "check_forbidden_words",
      "update_post_status",
    ],
    doesNot: [
      "Ne réécrit pas (c'est le Copywriter qui retry avec les corrections)",
      "Ne notifie pas Julien si REJECTED (Whapi retiré du V1, Julien check les rejected dans le dashboard)",
    ],
    costPerRun: "~$0.01-0.02 (15-25k tokens input avec brand voice + draft, 0.5-1k output structuré)",
    promptFile: "agents/src/prompts/quality_gate.system.md",
    agentFile: "agents/src/agents/quality_gate.py",
  },
  {
    id: "publisher-v1",
    name: "Pseudo-publisher V1",
    emoji: "📦",
    Icon: Send,
    llm: "Aucun (déterministe, code Python pur)",
    llmShort: "Pas un LLM",
    llmCostHint: "Coût : 0 (zéro appel API)",
    role: "Vérifie kill_switch et passe le post de pending_review à approved (= ready_to_publish).",
    description:
      "PAS un agent LLM. Code Python pur dans agents/src/agents/pseudo_publisher.py. Workflow V1 : aucune publication automatique sur Meta/TikTok. Le post reste status='approved' (alias 'ready_to_publish') et attend que Julien le télécharge depuis le dashboard, le publie à la main sur ses comptes, puis revienne cliquer 'Marquer publié'. V1.5 (Phase H roadmap) : remplacé par un bouton 'Publier 1-click' qui appellera Meta Graph API et TikTok Content Posting API (App Review obligatoire avant). Mais toujours déclenché par un humain — jamais d'auto-publi.",
    inputs: ["Post APPROVED en DB"],
    outputs: ["status='approved' (= ready_to_publish), pas de publication réelle"],
    tools: ["check_kill_switch", "update_post_status (DB only)"],
    doesNot: [
      "Ne publie PAS sur Meta/TikTok automatiquement (V1 = manuel, V1.5 = bouton humain)",
      "N'envoie pas de notif WhatsApp (Whapi retiré du V1)",
    ],
    costPerRun: "0",
    promptFile: "(pas de prompt, déterministe)",
    agentFile: "agents/src/agents/pseudo_publisher.py",
  },
];

export default function AdminMarketingAgents() {
  const [authChecking, setAuthChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          window.location.href = "/connexion?redirect=/admin/marketing/agents";
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.access_token) {
          window.location.href = "/connexion?redirect=/admin/marketing/agents";
          return;
        }
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (cancelled) return;
        setIsAdmin(!!roleData);
      } catch (err) {
        console.error("[AdminMarketingAgents] auth error:", err);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (authChecking) return <AdminLoading />;
  if (!isAdmin) return <AdminAccessDenied />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <a href="/admin/marketing">
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Retour">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </a>
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-5 w-5 text-primary shrink-0" />
              <h1 className="text-base sm:text-lg font-bold truncate">Agents IA Marketing</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Intro + diagramme du flow */}
        <section className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            Comment ça marche
          </h2>
          <p className="text-sm text-muted-foreground">
            Chaque jour à 9h00 (Europe/Paris, configurable depuis{" "}
            <a href="/admin/marketing/settings" className="underline font-medium hover:text-foreground">
              Réglages
            </a>
            ), le scheduler in-process déclenche le pipeline ci-dessous. Le carrousel généré
            apparaît dans <a href="/admin/marketing" className="underline font-medium hover:text-foreground">la liste des posts</a>{" "}
            avec status <span className="font-mono text-xs bg-emerald-100 text-emerald-800 px-1 rounded">approved</span> = prêt à publier.
            Tu télécharges le ZIP, tu publies à la main sur tes comptes, puis tu cliques "Marquer publié".
          </p>
          <div className="font-mono text-xs bg-card border rounded-md p-3 overflow-x-auto">
            <span className="text-muted-foreground">tick 9h00 →</span>{" "}
            <strong>Strategist</strong> → <strong>Researcher</strong> →{" "}
            <strong>Copywriter</strong> → <strong>Visual Director</strong> →{" "}
            <strong>Quality Gate</strong>{" "}
            <span className="text-muted-foreground">[score ≥ seuil]</span> →{" "}
            <strong>Pseudo-publisher V1</strong>{" "}
            <span className="text-muted-foreground">→ status=approved</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Si Quality Gate REJECTED → 1 retry du Copywriter avec corrections, puis status=rejected si toujours REJECTED.
            Coût total observé typique : <span className="font-mono">$0.80–$1.50</span> par carrousel complet (cap dur configurable).
          </p>
        </section>

        {/* Cards par agent */}
        <section className="space-y-4">
          {AGENTS.map((a) => (
            <div key={a.id} className="rounded-xl border bg-card overflow-hidden">
              {/* Header card */}
              <div className="flex items-start gap-3 p-4 border-b bg-muted/20">
                <div className="text-2xl mt-0.5" aria-hidden>{a.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base">{a.name}</h3>
                    <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded">{a.llmShort}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{a.role}</p>
                </div>
                <a.Icon className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
              </div>

              {/* Body */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="md:col-span-2">
                  <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Description</h4>
                  <p className="text-sm">{a.description}</p>
                </div>

                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Inputs</h4>
                  <ul className="list-disc list-inside space-y-0.5">
                    {a.inputs.map((i, idx) => <li key={idx} className="text-sm">{i}</li>)}
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Outputs</h4>
                  <ul className="list-disc list-inside space-y-0.5">
                    {a.outputs.map((o, idx) => <li key={idx} className="text-sm">{o}</li>)}
                  </ul>
                </div>

                <div className="md:col-span-2">
                  <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Outils CrewAI ({a.tools.length})</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {a.tools.map((t) => (
                      <span key={t} className="text-xs font-mono bg-muted px-2 py-0.5 rounded border">{t}</span>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1">Ce qu'il NE fait PAS</h4>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {a.doesNot.map((d, idx) => <li key={idx} className="text-sm">{d}</li>)}
                  </ul>
                </div>

                <div className="md:col-span-2 pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    <strong className="text-foreground">Modèle :</strong> {a.llm} <span className="opacity-70">— {a.llmCostHint}</span>
                  </span>
                  <span>
                    <strong className="text-foreground">Coût/run :</strong> <span className="font-mono">{a.costPerRun}</span>
                  </span>
                </div>

                <div className="md:col-span-2 text-xs text-muted-foreground space-y-0.5">
                  <div>
                    <span className="font-mono">{a.agentFile}</span> · <span className="font-mono">{a.promptFile}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Footer note */}
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
          <h3 className="font-semibold flex items-center gap-1">
            <ExternalLink className="h-4 w-4" />
            Pour modifier le comportement des agents
          </h3>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Réglages dynamiques</strong> (ratio CTA, seuil qualité, horaire, mode test) :{" "}
              <a href="/admin/marketing/settings" className="underline font-medium">/admin/marketing/settings</a>
            </li>
            <li>
              <strong>Bibliothèque d'angles éditable</strong> : Niveau 2 (V2 backlog, cf. todo.md du repo gerermonchantier-marketing)
            </li>
            <li>
              <strong>Prompts agents éditables</strong> : Niveau 3 (V2+ backlog, demande versioning + safety net)
            </li>
            <li>
              Pour l'instant les prompts sont fichiers MD dans le repo Python — modification requiert un déploiement Docker
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
