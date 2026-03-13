import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowRight, Loader2, Plus, Trash2, HardHat, Hammer, Wrench, Ruler } from 'lucide-react';
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

  // ── Écran de confirmation (remplace le contenu de la carte) ──
  if (confirmDelete) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 bg-[#0f1d36] border border-red-500/25
          rounded-2xl p-6 min-h-[180px] animate-fade-up"
        style={{ animationDelay: `${delay}s`, animationFillMode: 'both' }}
      >
        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Trash2 className="h-4 w-4 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-sm text-slate-200 font-semibold">Supprimer ce chantier ?</p>
          <p className="text-xs text-white/70 font-medium mt-1 line-clamp-1 max-w-[200px] mx-auto">
            «&nbsp;{chantier.nom}&nbsp;»
          </p>
          <p className="text-xs text-slate-600 mt-1">Action irréversible.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirmDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-500/20 border border-red-500/30
              text-red-300 hover:bg-red-500/30 rounded-xl px-4 py-2 transition-all disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
          <button
            onClick={handleCancelDelete}
            className="text-xs text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/10
              border border-white/10 rounded-xl px-4 py-2 transition-all font-medium"
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
      className="group flex flex-col gap-4 bg-[#0d1b33] border border-white/[0.08] hover:border-blue-500/40
        hover:bg-[#0f1f3a] rounded-2xl p-5 transition-all cursor-pointer no-underline animate-fade-up
        min-h-[180px] relative backdrop-blur-sm"
      style={{ animationDelay: `${delay}s`, animationFillMode: 'both' }}
    >
      {/* Glow hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/[0.04] to-transparent
        opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* ── Bouton corbeille (coin haut droit) ── */}
      <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleDeleteClick}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-600 hover:text-red-400
            hover:bg-red-500/10 rounded-lg transition-all"
          title="Supprimer ce chantier"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Header ── */}
      <div className="flex items-start gap-3 pr-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/10
          border border-blue-500/20 flex items-center justify-center text-2xl flex-shrink-0 select-none">
          {chantier.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-base leading-tight truncate group-hover:text-blue-200 transition-colors">
            {chantier.nom}
          </h3>
          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full
            bg-blue-500/10 border border-blue-500/15 text-blue-400 text-[10px] font-medium">
            {phase}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-blue-400 transition-all
          group-hover:translate-x-0.5 flex-shrink-0 mt-1" />
      </div>

      {/* ── Stats ── */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {chantier.budget !== null && (
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06]
            rounded-lg px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 inline-block" />
            <span className="text-slate-400">Enveloppe</span>
            <span className="font-semibold text-white">
              {chantier.budget.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
            </span>
          </div>
        )}
        {nbDevis > 0 && (
          <div className="flex items-center gap-1.5 bg-blue-500/[0.08] border border-blue-500/10
            rounded-lg px-2.5 py-1">
            <span className="font-semibold text-blue-300">{nbDevis}</span>
            <span className="text-slate-500">devis</span>
          </div>
        )}
        {budgetSigne > 0 && (
          <div className="flex items-center gap-1.5 bg-emerald-500/[0.08] border border-emerald-500/10
            rounded-lg px-2.5 py-1">
            <span className="font-semibold text-emerald-300">
              {budgetSigne.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
            </span>
            <span className="text-slate-500">signé</span>
          </div>
        )}
      </div>

      {/* ── CTA ── */}
      <div className="mt-auto flex items-center gap-1.5 text-xs text-slate-500 group-hover:text-blue-300 transition-colors font-medium">
        <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        Voir le plan
      </div>
    </a>
  );
}

// ── Fond décoratif chantier ───────────────────────────────────────────────────

const PageBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {/* Blueprint grid principal */}
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(rgba(59,130,246,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.07) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }}
    />
    {/* Grille fine */}
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(rgba(59,130,246,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.025) 1px, transparent 1px)',
        backgroundSize: '15px 15px',
      }}
    />
    {/* Glows */}
    <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-blue-600/8 blur-[100px]" />
    <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full bg-indigo-600/6 blur-[100px]" />
    <div className="absolute -bottom-32 left-1/4 w-[400px] h-[400px] rounded-full bg-amber-500/5 blur-[100px]" />
    {/* Éléments décoratifs chantier */}
    <div className="absolute top-8 right-20 opacity-[0.05] select-none">
      <HardHat className="w-52 h-52 text-amber-400" strokeWidth={0.5} />
    </div>
    <div className="absolute bottom-12 left-8 opacity-[0.04] select-none" style={{ transform: 'rotate(-20deg)' }}>
      <Hammer className="w-64 h-64 text-blue-300" strokeWidth={0.4} />
    </div>
    <div className="absolute top-1/2 right-8 opacity-[0.025] select-none" style={{ transform: 'rotate(15deg)' }}>
      <Ruler className="w-48 h-48 text-slate-400" strokeWidth={0.4} />
    </div>
    <div className="absolute bottom-1/3 right-1/3 opacity-[0.02] select-none" style={{ transform: 'rotate(-10deg)' }}>
      <Wrench className="w-40 h-40 text-blue-200" strokeWidth={0.4} />
    </div>
  </div>
);

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
      <div className="bg-[#050e1f] min-h-screen relative flex items-center justify-center">
        <PageBackground />
        <div className="relative flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-sm text-slate-400">Chargement de vos chantiers…</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-[#050e1f] min-h-screen relative flex items-center justify-center px-4">
        <PageBackground />
        <div className="relative text-center max-sm:max-w-sm">
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
      <div className="bg-[#050e1f] min-h-screen relative flex items-center justify-center px-4">
        <PageBackground />
        <div className="relative text-center max-w-md animate-fade-up">
          <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6 text-3xl">
            🏗️
          </div>
          <h1 className="font-bold text-white text-2xl mb-2">
            Aucun chantier pour l'instant
          </h1>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Décrivez votre projet en quelques mots et obtenez un plan complet
            généré en quelques secondes.
          </p>
          <a
            href="/mon-chantier/nouveau"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl transition-colors no-underline shadow-lg shadow-blue-500/25"
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
    <div className="bg-[#050e1f] min-h-screen relative">
      <PageBackground />

      <div className="relative py-12 px-4">
        <div className="max-w-5xl mx-auto">

          {/* ── Header ── */}
          <div className="mb-10 animate-fade-up">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20
                flex items-center justify-center">
                <HardHat className="h-4 w-4 text-amber-400" />
              </div>
              <span className="text-xs font-bold text-amber-400/80 uppercase tracking-widest">
                Mon espace chantier
              </span>
            </div>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-bold text-white text-3xl md:text-4xl mb-1.5">
                  Mes chantiers
                </h1>
                <p className="text-slate-400 text-sm">
                  <span className="text-white font-semibold">{chantiers.length}</span>{' '}
                  chantier{chantiers.length > 1 ? 's' : ''} en cours
                </p>
              </div>
              <a
                href="/mon-chantier/nouveau"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500
                  text-white font-semibold rounded-xl transition-colors no-underline text-sm
                  shadow-lg shadow-blue-600/25"
              >
                <Plus className="h-4 w-4" />
                Nouveau chantier
              </a>
            </div>
            {/* Séparateur décoratif */}
            <div className="mt-6 h-px bg-gradient-to-r from-blue-500/30 via-blue-500/10 to-transparent" />
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
