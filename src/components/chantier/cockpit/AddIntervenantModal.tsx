import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, X, Loader2, AlertTriangle } from 'lucide-react';
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

// ── Cohérence : mots-clés projet → corps de métier compatibles ───────────────
//
// Règle : si le nom du projet contient un mot-clé d'une règle ET que le jobType
// ajouté figure dans les types compatibles → cohérent.
// Si aucune règle ne matche → on vérifie l'affinité avec les lots existants.
// Sinon → on demande confirmation à l'utilisateur.

const PROJECT_RULES: { keywords: string[]; compatible: string[] }[] = [
  {
    keywords: ['portail', 'clôture', 'cloture', 'grillage', 'barrière', 'barriere', 'portillon', 'haie'],
    compatible: ['serrurerie', 'espaces_verts', 'maconnerie', 'electricite', 'terrassement'],
  },
  {
    keywords: ['terrasse', 'deck', 'pergola', 'véranda', 'veranda'],
    compatible: ['serrurerie', 'menuiserie_ext', 'maconnerie', 'etancheite', 'terrassement', 'revetement_sol', 'carrelage'],
  },
  {
    keywords: ['bois', 'charpente', 'ossature'],
    compatible: ['couverture', 'serrurerie', 'menuiserie_ext', 'menuiserie_int', 'etancheite'],
  },
  {
    keywords: ['piscine', 'spa', 'jacuzzi'],
    compatible: ['terrassement', 'maconnerie', 'plomberie', 'carrelage', 'etancheite', 'electricite'],
  },
  {
    keywords: ['cuisine', 'salle de bain', 'sanitaire', 'wc', 'douche'],
    compatible: ['plomberie', 'chauffage', 'carrelage', 'electricite', 'menuiserie_int', 'peinture', 'agencement'],
  },
  {
    keywords: ['toiture', 'toit', 'comble', 'zinguerie'],
    compatible: ['couverture', 'isolation', 'charpente', 'etancheite'],
  },
  {
    keywords: ['extension', 'agrandissement', 'construction', 'maison', 'bâtiment', 'batiment'],
    compatible: ['terrassement', 'maconnerie', 'couverture', 'electricite', 'plomberie', 'isolation', 'peinture', 'menuiserie_ext', 'menuiserie_int'],
  },
  {
    keywords: ['rénovation', 'renovation', 'réhabilitation', 'rehabilitation', 'rafraîchissement'],
    compatible: ['maconnerie', 'electricite', 'plomberie', 'isolation', 'peinture', 'carrelage', 'revetement_sol', 'menuiserie_int', 'agencement'],
  },
  {
    keywords: ['jardin', 'paysager', 'pelouse', 'aménagement extérieur', 'amenagement exterieur'],
    compatible: ['espaces_verts', 'terrassement', 'maconnerie', 'electricite'],
  },
  {
    keywords: ['électrique', 'electrique', 'domotique', 'motoris'],
    compatible: ['electricite', 'serrurerie'],
  },
];

// Groupes d'affinité : des corps de métier qui vont naturellement ensemble
const AFFINITY_GROUPS: string[][] = [
  ['terrassement', 'maconnerie', 'demolition', 'etancheite'],
  ['couverture', 'etancheite', 'isolation'],
  ['menuiserie_ext', 'menuiserie_int', 'serrurerie'],
  ['electricite'],
  ['plomberie', 'chauffage'],
  ['isolation', 'peinture', 'carrelage', 'revetement_sol', 'agencement'],
  ['serrurerie', 'espaces_verts', 'terrassement'],
];

function isCoherent(newJobType: string, existingJobTypes: string[], projectName: string): boolean {
  const name = projectName.toLowerCase();

  // 1. Règles mot-clé projet
  for (const rule of PROJECT_RULES) {
    if (rule.keywords.some(kw => name.includes(kw)) && rule.compatible.includes(newJobType)) {
      return true;
    }
  }

  // 2. Affinité avec les lots déjà présents
  const newGroup = AFFINITY_GROUPS.find(g => g.includes(newJobType));
  if (newGroup && existingJobTypes.some(t => newGroup.includes(t))) {
    return true;
  }

  return false;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ConfirmState {
  nom: string;
  emoji: string;
  jobType: string;
  justification: string;
}

export default function AddIntervenantModal({ chantierId, token, existingNoms, existingJobTypes, projectName, onClose, onAdded }: {
  chantierId: string;
  token: string;
  existingNoms: string[];
  existingJobTypes: string[];
  projectName: string;
  onClose: () => void;
  onAdded: (lot: LotChantier) => void;
}) {
  const [customNom, setCustomNom] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

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
        toast.error(data.error ?? `Erreur ${res.status}`);
      }
    } catch {
      toast.error('Erreur réseau, réessayez.');
    } finally {
      setAdding(null);
    }
  }

  function handlePresetClick(nom: string, emoji: string, jobType: string) {
    if (isCoherent(jobType, existingJobTypes, projectName)) {
      add(nom, emoji, jobType);
    } else {
      setConfirmState({ nom, emoji, jobType, justification: '' });
    }
  }

  function handleCustomAdd() {
    const nom = customNom.trim();
    if (!nom) return;
    // Corps de métier personnalisé → toujours cohérent (l'utilisateur sait ce qu'il fait)
    add(nom, '🔧', 'autre');
  }

  const available = PRESET_INTERVENANTS.filter(p => !existingNoms.includes(p.nom));

  // ── Écran de confirmation (corps de métier incohérent) ────────────────────
  if (confirmState) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Confirmer l'ajout</h2>
            <button onClick={() => setConfirmState(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>

          <div className="px-5 py-5 space-y-4">
            {/* Alerte incohérence */}
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {confirmState.emoji} {confirmState.nom} semble peu lié à votre projet
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Votre projet <strong>« {projectName} »</strong> ne mentionne pas ce type de prestation.
                  Cela pourrait gonfler artificiellement votre budget estimé.
                </p>
              </div>
            </div>

            {/* Justification */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Quel est le rôle de ce professionnel dans votre projet ?
              </label>
              <textarea
                autoFocus
                value={confirmState.justification}
                onChange={e => setConfirmState(prev => prev ? { ...prev, justification: e.target.value } : null)}
                placeholder={`Ex : "${confirmState.nom === 'Plomberie' ? 'Raccordement eau pour un point d\'eau sur la terrasse' : `Précisez le rôle de ${confirmState.nom} dans ce chantier`}"`}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Cette information permet de mieux estimer le budget.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmState(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => add(confirmState.nom, confirmState.emoji, confirmState.jobType)}
                disabled={!confirmState.justification.trim() || !!adding}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmer l'ajout
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Écran principal ────────────────────────────────────────────────────────
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
              onKeyDown={e => { if (e.key === 'Enter') handleCustomAdd(); }}
              placeholder="Ou tapez un nom personnalisé…"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
            <button
              onClick={handleCustomAdd}
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
                onClick={() => handlePresetClick(p.nom, p.emoji, p.jobType)}
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
