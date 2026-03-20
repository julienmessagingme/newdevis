import { useState, useRef } from 'react';
import { Check, Plus, X, ArrowRight, ChevronLeft, Clock, Wallet } from 'lucide-react';
import type { FollowUpQuestion } from '@/types/chantier-ia';

interface ScreenQualificationProps {
  questions: FollowUpQuestion[];
  description: string;
  onSubmit: (answers: Record<string, string>) => void;
  onBack: () => void;
}

// ── Détection des éléments projet depuis la description ──────────────────────

interface DetectedElement {
  label: string;
  budgetMin: number;
  budgetMax: number;
  durationWeeks: number;
}

const KEYWORD_MAP: { pattern: RegExp; label: string; group: string; budgetMin: number; budgetMax: number; durationWeeks: number }[] = [
  { pattern: /piscine\s+enterr/i,    group: 'piscine',   label: 'Piscine enterrée',        budgetMin: 25000, budgetMax: 45000, durationWeeks: 8  },
  { pattern: /piscine\s+semi/i,      group: 'piscine',   label: 'Piscine semi-enterrée',   budgetMin: 15000, budgetMax: 28000, durationWeeks: 6  },
  { pattern: /piscine\s+hors.sol/i,  group: 'piscine',   label: 'Piscine hors-sol',        budgetMin: 8000,  budgetMax: 15000, durationWeeks: 2  },
  { pattern: /piscine/i,             group: 'piscine',   label: 'Piscine',                 budgetMin: 20000, budgetMax: 40000, durationWeeks: 8  },
  { pattern: /pool.?house/i,         group: 'poolhouse', label: 'Pool house',              budgetMin: 15000, budgetMax: 35000, durationWeeks: 6  },
  { pattern: /terrasse\s+bois/i,     group: 'terrasse',  label: 'Terrasse bois',           budgetMin: 5000,  budgetMax: 12000, durationWeeks: 2  },
  { pattern: /terrasse\s+ip[eé]/i,   group: 'terrasse',  label: 'Terrasse ipé',            budgetMin: 6000,  budgetMax: 14000, durationWeeks: 2  },
  { pattern: /terrasse/i,            group: 'terrasse',  label: 'Terrasse',                budgetMin: 3000,  budgetMax: 10000, durationWeeks: 2  },
  { pattern: /pergola\s+bioclim/i,   group: 'pergola',   label: 'Pergola bioclimatique',   budgetMin: 12000, budgetMax: 30000, durationWeeks: 3  },
  { pattern: /pergola/i,             group: 'pergola',   label: 'Pergola',                 budgetMin: 5000,  budgetMax: 18000, durationWeeks: 2  },
  { pattern: /ravalement|fa[çc]ade/i,group: 'facade',    label: 'Ravalement de façade',    budgetMin: 8000,  budgetMax: 22000, durationWeeks: 3  },
  { pattern: /extension/i,           group: 'extension', label: 'Extension',               budgetMin: 50000, budgetMax: 120000,durationWeeks: 16 },
  { pattern: /cuisine/i,             group: 'cuisine',   label: 'Cuisine',                 budgetMin: 8000,  budgetMax: 25000, durationWeeks: 3  },
  { pattern: /salle\s+de\s+bain/i,   group: 'sdb',       label: 'Salle de bain',           budgetMin: 8000,  budgetMax: 20000, durationWeeks: 3  },
  { pattern: /[eé]clairage/i,        group: 'eclairage', label: 'Éclairage extérieur',     budgetMin: 1500,  budgetMax: 5000,  durationWeeks: 1  },
  { pattern: /isolation/i,           group: 'isolation', label: 'Isolation',               budgetMin: 5000,  budgetMax: 20000, durationWeeks: 2  },
  { pattern: /toiture|toit\b/i,      group: 'toiture',   label: 'Toiture',                 budgetMin: 10000, budgetMax: 30000, durationWeeks: 3  },
  { pattern: /[eé]lectricit[eé]/i,   group: 'elec',      label: 'Électricité',             budgetMin: 5000,  budgetMax: 15000, durationWeeks: 2  },
  { pattern: /plomberie/i,           group: 'plomberie', label: 'Plomberie',               budgetMin: 3000,  budgetMax: 10000, durationWeeks: 1  },
  { pattern: /jardin|paysager/i,     group: 'jardin',    label: 'Aménagement jardin',      budgetMin: 5000,  budgetMax: 15000, durationWeeks: 2  },
  { pattern: /arrosage/i,            group: 'arrosage',  label: 'Arrosage automatique',    budgetMin: 2000,  budgetMax: 5000,  durationWeeks: 1  },
  { pattern: /r[eé]novation/i,       group: 'renov',     label: 'Rénovation',              budgetMin: 10000, budgetMax: 50000, durationWeeks: 8  },
];

function parseDescription(description: string): DetectedElement[] {
  const found: DetectedElement[] = [];
  const usedGroups = new Set<string>();

  for (const kw of KEYWORD_MAP) {
    if (kw.pattern.test(description) && !usedGroups.has(kw.group)) {
      found.push({ label: kw.label, budgetMin: kw.budgetMin, budgetMax: kw.budgetMax, durationWeeks: kw.durationWeeks });
      usedGroups.add(kw.group);
    }
  }

  return found;
}

function formatBudget(n: number) {
  return n >= 1000
    ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} 000 €`
    : `${n} €`;
}

function formatDuration(weeks: number) {
  if (weeks < 4) return `${weeks} semaine${weeks > 1 ? 's' : ''}`;
  const months = Math.round(weeks / 4);
  return `${months} mois`;
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function ScreenQualification({
  description,
  onSubmit,
  onBack,
}: ScreenQualificationProps) {
  const initial = parseDescription(description);
  const [elements, setElements] = useState<DetectedElement[]>(
    initial.length > 0 ? initial : [{ label: 'Travaux', budgetMin: 5000, budgetMax: 20000, durationWeeks: 4 }],
  );
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const totalMin = elements.reduce((s, e) => s + e.budgetMin, 0);
  const totalMax = elements.reduce((s, e) => s + e.budgetMax, 0);
  const totalWeeks = Math.max(...elements.map((e) => e.durationWeeks), 1);

  const removeElement = (idx: number) =>
    setElements((prev) => prev.filter((_, i) => i !== idx));

  const addElement = () => {
    const label = newLabel.trim();
    if (!label) return;
    setElements((prev) => [
      ...prev,
      { label, budgetMin: 2000, budgetMax: 8000, durationWeeks: 2 },
    ]);
    setNewLabel('');
    setAdding(false);
  };

  const handleSubmit = () => {
    onSubmit({
      _detected_elements: elements.map((e) => e.label).join(', '),
      _budget_estimate: `${formatBudget(totalMin)} – ${formatBudget(totalMax)}`,
      _confirmed: 'true',
    });
  };

  return (
    <div className="min-h-screen bg-[#080d1a] flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
            Voici ce que j'ai compris
          </h1>
          <p className="text-slate-500 text-sm">
            Vérifiez et ajustez si besoin
          </p>
        </div>

        {/* Project description pill */}
        {description && (
          <div className="mb-6 inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-2 text-xs text-slate-500 max-w-full">
            <span className="shrink-0">💬</span>
            <span className="truncate italic">
              {description.length > 80 ? description.slice(0, 80) + '…' : description}
            </span>
          </div>
        )}

        {/* Detected elements card */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden mb-4">
          {/* Section header */}
          <div className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Éléments détectés
            </p>
          </div>

          {/* Element list */}
          <ul className="divide-y divide-white/[0.04]">
            {elements.map((el, idx) => (
              <li
                key={el.label + idx}
                className="flex items-center gap-3 px-5 py-3.5 group"
              >
                <div className="w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-blue-400" />
                </div>
                <span className="text-white text-sm flex-1 text-left">{el.label}</span>
                {elements.length > 1 && (
                  <button
                    onClick={() => removeElement(idx)}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-300 transition-all p-0.5 rounded"
                    title="Supprimer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* Add element */}
          <div className="px-5 py-3 border-t border-white/[0.04]">
            {adding ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addElement();
                    if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
                  }}
                  placeholder="Ex : Portail automatique"
                  autoFocus
                  className="flex-1 bg-transparent text-white text-sm placeholder-slate-600 outline-none border-b border-white/20 pb-1 focus:border-blue-500/50 transition-colors"
                />
                <button
                  onClick={addElement}
                  disabled={!newLabel.trim()}
                  className="text-blue-400 hover:text-blue-300 disabled:opacity-30 text-xs font-medium transition-colors"
                >
                  Ajouter
                </button>
                <button
                  onClick={() => { setAdding(false); setNewLabel(''); }}
                  className="text-slate-600 hover:text-slate-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter un élément
              </button>
            )}
          </div>
        </div>

        {/* Budget + Duration estimates */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-3.5 h-3.5 text-slate-500" />
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Budget estimé</p>
            </div>
            <p className="text-white font-bold text-base">
              {formatBudget(totalMin)}
            </p>
            <p className="text-slate-600 text-xs mt-0.5">
              jusqu'à {formatBudget(totalMax)}
            </p>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Durée estimée</p>
            </div>
            <p className="text-white font-bold text-base">
              {formatDuration(totalWeeks)}
            </p>
            <p className="text-slate-600 text-xs mt-0.5">
              selon les corps de métier
            </p>
          </div>
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <button
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl py-3.5 text-sm transition-all"
          >
            Créer mon plan
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={onBack}
            className="w-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm py-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Modifier mon projet
          </button>
        </div>

      </div>
    </div>
  );
}
