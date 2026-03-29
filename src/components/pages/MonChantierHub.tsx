import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowRight, Loader2, Plus, Trash2, HardHat, LayoutDashboard } from 'lucide-react';
import { toast } from 'sonner';
import AddChantierCard from '@/components/chantier/shared/AddChantierCard';
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
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: string }).error ?? `Erreur ${res.status}`;
        console.error('[MonChantierHub] DELETE failed:', res.status, msg);
        toast.error(`Impossible de supprimer : ${msg}`);
      }
    } catch (e) {
      console.error('[MonChantierHub] DELETE network error:', e);
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

  // ── Écran de confirmation ──
  if (confirmDelete) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 bg-white border border-red-100
          rounded-2xl p-6 min-h-[180px] animate-fade-up shadow-sm"
        style={{ animationDelay: `${delay}s`, animationFillMode: 'both' }}
      >
        <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
          <Trash2 className="h-4 w-4 text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-900 font-semibold">Supprimer ce chantier ?</p>
          <p className="text-xs text-gray-500 font-medium mt-1 line-clamp-1 max-w-[200px] mx-auto">
            «&nbsp;{chantier.nom}&nbsp;»
          </p>
          <p className="text-xs text-gray-400 mt-1">Action irréversible.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirmDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-50 border border-red-200
              text-red-600 hover:bg-red-100 rounded-xl px-4 py-2 transition-all disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
          <button
            onClick={handleCancelDelete}
            className="text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100
              border border-gray-200 rounded-xl px-4 py-2 transition-all font-medium"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  // ── Carte normale ──
  return (
    <a
      href={`/mon-chantier/${chantier.id}`}
      className="group flex flex-col gap-4 bg-white border border-gray-100 hover:border-blue-200
        hover:shadow-md rounded-2xl p-5 transition-all cursor-pointer no-underline animate-fade-up
        min-h-[180px] relative"
      style={{ animationDelay: `${delay}s`, animationFillMode: 'both' }}
    >
      {/* ── Bouton corbeille (coin haut droit) ── */}
      <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleDeleteClick}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500
            hover:bg-red-50 rounded-lg transition-all"
          title="Supprimer ce chantier"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Header ── */}
      <div className="flex items-start gap-3 pr-8">
        <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100
          flex items-center justify-center text-2xl flex-shrink-0 select-none">
          {chantier.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-base leading-tight truncate group-hover:text-blue-600 transition-colors">
            {chantier.nom}
          </h3>
          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full
            bg-blue-50 border border-blue-100 text-blue-600 text-[10px] font-medium">
            {phase}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-all
          group-hover:translate-x-0.5 flex-shrink-0 mt-1" />
      </div>

      {/* ── Stats ── */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {chantier.budget !== null && (
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100
            rounded-lg px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            <span className="text-gray-500">Enveloppe</span>
            <span className="font-semibold text-gray-900">
              {chantier.budget.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
            </span>
          </div>
        )}
        {nbDevis > 0 && (
          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100
            rounded-lg px-2.5 py-1">
            <span className="font-semibold text-blue-600">{nbDevis}</span>
            <span className="text-gray-400">devis</span>
          </div>
        )}
        {budgetSigne > 0 && (
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100
            rounded-lg px-2.5 py-1">
            <span className="font-semibold text-emerald-600">
              {budgetSigne.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
            </span>
            <span className="text-gray-400">signé</span>
          </div>
        )}
      </div>

      {/* ── CTA ── */}
      <div className="mt-auto flex items-center gap-1.5 text-xs text-gray-400 group-hover:text-blue-600 transition-colors font-medium">
        <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        Voir le plan
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
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-400">Chargement de vos chantiers…</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-sm:max-w-sm">
          <p className="text-red-500 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm bg-white border border-gray-200 hover:border-gray-300 text-gray-600 rounded-xl transition-colors"
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
      <div className="bg-gray-50 min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md animate-fade-up">
          <div className="w-20 h-20 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-6 text-3xl">
            🏗️
          </div>
          <h1 className="font-bold text-gray-900 text-2xl mb-2">
            Aucun chantier pour l\u2019instant
          </h1>
          <p className="text-gray-500 text-sm mb-8 leading-relaxed">
            Décrivez votre projet en quelques mots et obtenez un plan complet
            généré en quelques secondes.
          </p>
          <a
            href="/mon-chantier/nouveau"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors no-underline"
          >
            <Plus className="h-4 w-4" />
            Créer mon premier chantier
          </a>
        </div>
      </div>
    );
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="py-10 px-4">
        <div className="max-w-5xl mx-auto">

          {/* ── Header ── */}
          <div className="mb-8 animate-fade-up">
            {/* Retour site principal */}
            <a
              href="/tableau-de-bord"
              className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-xs transition-colors group mb-6"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Retour au tableau de bord
            </a>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100
                flex items-center justify-center">
                <HardHat className="h-4 w-4 text-amber-500" />
              </div>
              <span className="text-xs font-bold text-amber-600 uppercase tracking-widest">
                Mon espace chantier
              </span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-3xl md:text-4xl mb-1">
                Mes chantiers
              </h1>
              <p className="text-gray-500 text-sm">
                <span className="text-blue-600 font-semibold">{chantiers.length}</span>{' '}
                chantier{chantiers.length > 1 ? 's' : ''} en cours
              </p>
            </div>
            <div className="mt-5 h-px bg-gray-100" />
          </div>

          {/* ── Grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {chantiers.map((c, i) => (
              <ChantierHubCard
                key={c.id}
                chantier={c}
                token={token ?? ''}
                delay={i * 0.06}
                onDelete={handleDelete}
              />
            ))}
            {/* Carte d'ajout toujours visible */}
            <AddChantierCard delay={chantiers.length * 0.06} />
          </div>
        </div>
      </div>
    </div>
  );
}
