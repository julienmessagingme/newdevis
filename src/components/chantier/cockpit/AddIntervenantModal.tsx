import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, Loader2 } from 'lucide-react';
import type { LotChantier } from '@/types/chantier-ia';

// ── Intervenants preset ───────────────────────────────────────────────────────

const PRESET_INTERVENANTS = [
  { nom: 'Terrassement',             emoji: '🏗', jobType: 'terrassement' },
  { nom: 'Maçonnerie',               emoji: '🧱', jobType: 'maconnerie' },
  { nom: 'Charpente / Couverture',   emoji: '🏚', jobType: 'couverture' },
  { nom: 'Menuiserie extérieure',    emoji: '🪟', jobType: 'menuiserie_ext' },
  { nom: 'Menuiserie intérieure',    emoji: '🚪', jobType: 'menuiserie_int' },
  { nom: 'Électricité',              emoji: '⚡', jobType: 'electricite' },
  { nom: 'Plomberie',                emoji: '🚿', jobType: 'plomberie' },
  { nom: 'Chauffage / Climatisation',emoji: '🔥', jobType: 'chauffage' },
  { nom: 'Isolation',                emoji: '🧤', jobType: 'isolation' },
  { nom: 'Peinture',                 emoji: '🎨', jobType: 'peinture' },
  { nom: 'Carrelage / Faïence',      emoji: '🪟', jobType: 'carrelage' },
  { nom: 'Revêtements de sol',       emoji: '🪵', jobType: 'revetement_sol' },
  { nom: 'Agencement / Placards',    emoji: '🛋', jobType: 'agencement' },
  { nom: 'Étanchéité',               emoji: '🛡', jobType: 'etancheite' },
  { nom: 'Démolition',               emoji: '⛏', jobType: 'demolition' },
  { nom: 'Serrurerie / Métallerie',  emoji: '🔧', jobType: 'serrurerie' },
  { nom: 'Espaces verts',            emoji: '🌿', jobType: 'espaces_verts' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddIntervenantModal({ chantierId, token, existingNoms, onClose, onAdded }: {
  chantierId: string;
  token: string;
  existingNoms: string[];
  onClose: () => void;
  onAdded: (lot: LotChantier) => void;
}) {
  const [customNom, setCustomNom] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  async function add(nom: string, emoji: string, jobType: string) {
    if (adding) return;
    setAdding(nom);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/lots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nom, emoji, jobType }),
      });
      const data = await res.json();
      if (res.ok && data.lot) {
        // Normalise le lot reçu pour qu'il soit compatible avec LotChantier
        const lot: LotChantier = {
          id: data.lot.id,
          nom: data.lot.nom,
          statut: 'a_trouver' as const,
          ordre: 999,
          emoji: data.lot.emoji ?? undefined,
          job_type: data.lot.job_type ?? undefined,
        };
        onAdded(lot);
        toast.success(`${emoji} ${nom} ajouté`);
        onClose();
      } else {
        const msg = data.error ?? `Erreur ${res.status}`;
        toast.error(`Impossible d'ajouter : ${msg}`);
      }
    } catch {
      toast.error('Erreur réseau, réessayez.');
    } finally {
      setAdding(null);
    }
  }

  const available = PRESET_INTERVENANTS.filter(p => !existingNoms.includes(p.nom));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Ajouter un intervenant</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-3">
          {/* Custom nom */}
          <div className="flex gap-2">
            <input
              value={customNom}
              onChange={e => setCustomNom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && customNom.trim()) add(customNom.trim(), '🔧', 'autre'); }}
              placeholder="Ou tapez un nom personnalisé…"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
            <button
              onClick={() => { if (customNom.trim()) add(customNom.trim(), '🔧', 'autre'); }}
              disabled={!customNom.trim() || !!adding}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {adding === customNom.trim() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
          {/* Preset list */}
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-2">Types courants</p>
          <div className="grid grid-cols-1 gap-1.5">
            {available.map(p => (
              <button
                key={p.jobType}
                onClick={() => add(p.nom, p.emoji, p.jobType)}
                disabled={!!adding}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl hover:bg-blue-50 transition-colors text-left disabled:opacity-50 group"
              >
                <span className="text-lg w-7 text-center shrink-0">{p.emoji}</span>
                <span className="text-sm font-medium text-gray-800 group-hover:text-blue-700 transition-colors flex-1">{p.nom}</span>
                {adding === p.nom
                  ? <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
                  : <Plus className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
                }
              </button>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Tous les types courants ont été ajoutés.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
