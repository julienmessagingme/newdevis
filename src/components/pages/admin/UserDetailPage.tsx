/**
 * src/components/pages/admin/UserDetailPage.tsx
 *
 * Vue 360° d'un utilisateur pour l'admin. Lit l'ID/email depuis l'URL
 * `/admin/users/[id]` (UUID ou email), interroge /api/admin/users/[id]
 * et affiche :
 *   - En-tête profil + contact
 *   - Abonnement GMC (plan, trial, échéance)
 *   - Bouton « écrire un mail perso » (mailto pré-rempli)
 *   - Chantiers avec compteurs (lots/docs/contacts/tâches)
 *   - Analyses VMD
 *   - Timeline unifiée des 30 derniers événements
 *
 * Pas de style spectaculaire — outil interne, priorité à la lisibilité.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Mail, Phone, ExternalLink, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UserDetailData {
  auth: {
    id: string;
    email: string | null;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    provider: string | null;
    metadata: Record<string, any>;
  };
  gmc_subscription: any;
  vmd_signup: any;
  chantiers: Array<any>;
  analyses: Array<any>;
  gmc_emails: Array<any>;
  vmd_emails: Array<any>;
  agent_insights: Array<any>;
  timeline: Array<{ at: string; kind: string; label: string; chantier_id?: string }>;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fmtEUR(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

export default function UserDetailPage() {
  const [data, setData] = useState<UserDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawId, setRawId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const path = window.location.pathname;
      const match = path.match(/\/admin\/users\/([^/?#]+)/);
      if (!match) { setError("URL invalide"); setLoading(false); return; }
      const id = decodeURIComponent(match[1]);
      setRawId(id);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Session expirée. Reconnectez-vous."); setLoading(false); return; }

      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? `Erreur ${res.status}`); setLoading(false); return; }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const buildMailtoUrl = (): string => {
    if (!data?.auth.email) return "#";
    const firstName = data.auth.metadata?.first_name ?? "";
    const subject = "GérerMonChantier — un mot personnel";
    const body = `Bonjour ${firstName || ""},\n\nJe suis Julien, co-fondateur de VerifierMonDevis et GérerMonChantier. Je voulais vous accueillir personnellement et voir si je peux vous aider à démarrer votre premier chantier.\n\nSi vous voulez, je peux vous accompagner en 15 minutes en visio ou par téléphone — juste pour vous montrer comment tirer le meilleur de l'outil.\n\nDans tous les cas, votre retour m'intéresse énormément. Vous pouvez me répondre directement à cette adresse.\n\nBelle journée,\nJulien Dumas`;
    return `mailto:${data.auth.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-16 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </main>
    );
  }
  if (error) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-16">
        <a href="/admin" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour admin
        </a>
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-900">
          <p className="font-medium">{error}</p>
          <p className="text-sm mt-1">ID/email demandé : <code>{rawId}</code></p>
          <Button variant="outline" size="sm" onClick={load} className="mt-3">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Réessayer
          </Button>
        </div>
      </main>
    );
  }
  if (!data) return null;

  const meta = data.auth.metadata;
  const firstName = meta?.first_name ?? "";
  const lastName = meta?.last_name ?? "";
  const phone = meta?.phone ?? "—";
  const acceptCom = meta?.accept_commercial_offers === true;
  const sub = data.gmc_subscription;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <a href="/admin" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Retour admin
      </a>

      {/* ─── Header profil ─── */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : (data.auth.email ?? "—")}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {data.auth.email}</span>
              <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {phone}</span>
              <span>Provider&nbsp;: <strong className="text-foreground">{data.auth.provider ?? "—"}</strong></span>
              <span>Inscription&nbsp;: <strong className="text-foreground">{fmtDate(data.auth.created_at)}</strong></span>
              <span>Dernière connexion&nbsp;: <strong className="text-foreground">{fmtDate(data.auth.last_sign_in_at)}</strong></span>
              <span>Opt-in commercial&nbsp;: <strong className={acceptCom ? "text-emerald-700" : "text-amber-700"}>{acceptCom ? "oui" : "non"}</strong></span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <Button asChild size="sm"><a href={buildMailtoUrl()}>Écrire un mail perso</a></Button>
            <Button asChild variant="outline" size="sm"><a href={`tel:${phone}`}>Appeler</a></Button>
          </div>
        </div>
      </div>

      {/* ─── Abonnement GMC ─── */}
      {sub && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-3">Abonnement GMC</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><dt className="text-muted-foreground text-xs">Plan</dt><dd className="font-medium">{sub.plan}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Statut</dt><dd className="font-medium">{sub.status}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Signup source</dt><dd className="font-medium">{sub.signup_source ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Opt-out emails</dt><dd className="font-medium">{sub.email_opt_out ? "oui" : "non"}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Trial début</dt><dd className="font-medium">{fmtDateShort(sub.trial_started_at)}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Trial fin</dt><dd className="font-medium">{fmtDateShort(sub.trial_ends_at)}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Stripe client</dt><dd className="font-medium">{sub.stripe_customer_id ? sub.stripe_customer_id.substring(0, 18) + "…" : "—"}</dd></div>
            <div><dt className="text-muted-foreground text-xs">Stripe sub</dt><dd className="font-medium">{sub.stripe_subscription_id ? sub.stripe_subscription_id.substring(0, 18) + "…" : "—"}</dd></div>
          </dl>
        </div>
      )}

      {/* ─── Chantiers ─── */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-3">
          Chantiers ({data.chantiers.length})
        </h2>
        {data.chantiers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun chantier créé pour l'instant.</p>
        ) : (
          <div className="space-y-3">
            {data.chantiers.map((c) => (
              <div key={c.id} className="border border-border/70 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{c.nom}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Créé {fmtDateShort(c.created_at)} · statut {c.statut ?? "—"} · budget {fmtEUR(c.budget)}
                    </div>
                  </div>
                  <a
                    href={`https://www.gerermonchantier.fr/mon-chantier/${c.id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 flex-shrink-0"
                  >
                    Voir <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
                  <div className="text-center bg-muted/50 rounded p-2"><div className="font-bold">{c.counters.lots}</div><div className="text-muted-foreground">Lots</div></div>
                  <div className="text-center bg-muted/50 rounded p-2"><div className="font-bold">{c.counters.documents}</div><div className="text-muted-foreground">Docs</div></div>
                  <div className="text-center bg-muted/50 rounded p-2"><div className="font-bold">{c.counters.contacts}</div><div className="text-muted-foreground">Contacts</div></div>
                  <div className="text-center bg-muted/50 rounded p-2"><div className="font-bold">{c.counters.taches}</div><div className="text-muted-foreground">Tâches</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Analyses VMD ─── */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-3">
          Analyses VMD ({data.analyses.length})
        </h2>
        {data.analyses.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucune analyse VMD.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.analyses.slice(0, 10).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
                <div>
                  <div className="font-medium truncate max-w-md">{a.file_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDateShort(a.created_at)} · {a.status} · {a.score ?? "—"} · {a.review_status ?? "—"}
                  </div>
                </div>
                <a href={`/analyse/${a.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex-shrink-0">
                  Voir
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── Timeline unifiée ─── */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-3">
          Timeline ({data.timeline.length} derniers événements)
        </h2>
        {data.timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun événement.</p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {data.timeline.map((e, i) => (
              <li key={i} className="flex gap-3 border-b border-border/30 pb-1.5 last:border-0">
                <span className="text-xs text-muted-foreground w-32 flex-shrink-0 pt-0.5">{fmtDate(e.at)}</span>
                <span className="text-xs font-mono text-muted-foreground/70 w-20 flex-shrink-0 pt-0.5">{e.kind}</span>
                <span className="text-foreground/85">{e.label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
