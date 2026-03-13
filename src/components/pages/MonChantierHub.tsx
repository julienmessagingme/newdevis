import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Sparkles, ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import AddChantierCard from '@/components/chantier/dashboard/AddChantierCard';
import { PHASE_LABELS, type PhaseChantier } from '@/types/chantier-dashboard';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

interface ChantierItem {
  id: string;
  nom: string;
  emoji: string;
  budget: number | null;
  phase: PhaseChantier;
  created_at: string;
  devis: { id: string; nom: string; montant: number | null; statut: string }[];
}

// ── Carte chantier ─────────────────────────────────────────────────────────────

function ChantierHubCard({
  chantier,
  token,
  delay = 0,
  onDelete,
}: {
  chantier: ChantierItem;
  token: string;
  delay?: number;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const phase = PHASE_LABELS[chantier.phase] ?? chantier.phase;
  const nbDevis = chantier.devis.length;
  const budgetSigne = chantier.devis
    .filter((d) => d.statut === 'signe' && d.montant !== null)
    .reduce((sum, d) => sum + (d.montant ?? 0), 0);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      const res = await fetch(`/api/chantier/${chantier.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success('Chantier supprimé');
        onDelete(chantier.id);
      } else {
        toast.error('Impossible de supprimer ce chantier');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete(false);
  };

  return (
    <a
      href={`/mon-chantier/${chantier.id}`}
      className="group flex flex-col gap-4 bg-[#162035] border border-white/10 hover:border-blue-500/40
        hover:bg-[#1a2640] rounded-2xl p-5 transition-all cursor-pointer no-underline animate-fade-up relative"
      style={{ animationDelay: `${delay}s`, animationFillMode: 'both' }}
    >
      {/* ── Zone suppression (coin haut droit) ── */}
      <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1 text-[11px] font-semibold bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 rounded-lg px-2.5 py-1 transition-all disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {deleting ? 'Suppression…' : 'Confirmer'}
            </button>
            <button
              onClick={handleCancelDelete}
              className="text-[11px] text-slate-500 hover:text-slate-300 px-2 py-1 transition-colors"
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            onClick={handleDeleteClick}
            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
            title="Supprimer ce chantier"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Header ── */}
      <div className="flex items-start gap-3 pr-6">
        <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl flex-shrink-0 select-none">
          {chantier.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-white text-base leading-tight truncate group-hover:text-blue-200 transition-colors">
            {chantier.nom}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">{phase}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5 flex-shrink-0 mt-1" />
      </div>

      {/* ── Stats ── */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        {chantier.budget !== null && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
            Enveloppe&nbsp;
            <span className="font-semibold text-slate-300">
              {chantier.budget.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
            </span>
          </span>
        )}
        {nbDevis > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 inline-block" />
            <span className="font-semibold text-blue-300">{nbDevis}</span>&nbsp;devis
          </span>
        )}
        {budgetSigne > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/60 inline-block" />
            <span className="font-semibold text-green-300">
              {budgetSigne.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
            </span>&nbsp;signé
          </span>
        )}
      </div>

      {/* ── CTA ── */}
      <div className="flex items-center gap-1.5 text-xs text-blue-400/70 group-hover:text-blue-300 transition-colors font-medium">
        <Sparkles className="h-3 w-3 shrink-0" />
        Voir le plan IA
      </div>
    </a>
  );
}

// ── Hub principal ──────────────────────────────────────────────────────────────

export default function MonChantierHub() {
  const [loading, setLoading] = useState(true);
  const [chantiers, setChantiers] = useState<ChantierItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        window.location.href = '/connexion?redirect=/mon-chantier';
        return;
      }

      const tok = session.access_token;
      if (!cancelled) setToken(tok);

      try {
        const res = await fetch('/api/chantier', {
          headers: { Authorization: `Bearer ${tok}` },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (!cancelled) setChantiers(json.chantiers ?? []);
      } catch (err) {
        if (!cancelled) {
          setError('Impossible de charger vos chantiers. Veuillez réessayer.');
          console.error('[MonChantierHub] fetch error:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const handleDelete = useCallback((id: string) => {
    setChantiers((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm text-slate-500">Chargement de vos chantiers…</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-sm:max-w-sm">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm bg-white/5 border border-white/10 hover:border-white/20 text-slate-300 rounded-xl transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (chantiers.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-md animate-fade-up">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-6 text-2xl">
            🏗️
          </div>
          <h1 className="font-display font-bold text-white text-2xl mb-2">
            Aucun chantier pour l'instant
          </h1>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">
            Décrivez votre projet en quelques mots et obtenez un plan complet
            généré par l'IA en 10 secondes.
          </p>
          <a
            href="/mon-chantier/nouveau"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl transition-colors no-underline"
          >
            <Plus className="h-4 w-4" />
            Créer mon premier chantier IA
          </a>
        </div>
      </div>
    );
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8 animate-fade-up">
          <h1 className="font-display font-bold text-white text-2xl md:text-3xl mb-1">
            Mes chantiers
          </h1>
          <p className="text-slate-500 text-sm">
            {chantiers.length} chantier{chantiers.length > 1 ? 's' : ''} en cours
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {chantiers.map((c, i) => (
            <ChantierHubCard
              key={c.id}
              chantier={c}
              token={token ?? ''}
              delay={i * 0.05}
              onDelete={handleDelete}
            />
          ))}
          {/* Add card toujours visible */}
          <AddChantierCard delay={chantiers.length * 0.05} />
        </div>
      </div>
    </div>
  );
}
