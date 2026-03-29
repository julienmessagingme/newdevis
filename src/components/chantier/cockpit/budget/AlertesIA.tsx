import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { fmtK } from '@/lib/budgetHelpers';
import type { LotChantier, DocumentChantier } from '@/types/chantier-ia';

export interface ActionAlert {
  type: 'alert' | 'warning' | 'tip' | 'ok';
  icon: string;
  text: string;
  btn?: string;
  onBtn?: () => void;
}

export function computeActionAlerts(
  lots: LotChantier[],
  documents: DocumentChantier[],
  onAddDoc: () => void,
  onGoToLot?: (id: string) => void,
): ActionAlert[] {
  const alerts: ActionAlert[] = [];

  // Trier par budget desc → les intervenants les plus coûteux d'abord
  const sorted = [...lots].sort((a, b) => (b.budget_max_ht ?? 0) - (a.budget_max_ht ?? 0));

  for (const lot of sorted) {
    const devisLot = documents.filter(d => d.lot_id === lot.id && d.document_type === 'devis');
    if (devisLot.length === 0) {
      alerts.push({
        type: 'alert', icon: '📋',
        text: `Aucun devis ${lot.nom.toLowerCase()} — demandez au moins 2 devis pour valider ce poste.`,
        btn: '+ Ajouter un devis', onBtn: onAddDoc,
      });
    } else if (devisLot.length === 1) {
      alerts.push({
        type: 'warning', icon: '⚖️',
        text: `1 seul devis ${lot.nom.toLowerCase()} — ajoutez un 2e devis pour comparer les prix (écart moyen : 20–30 %).`,
        btn: '+ Ajouter un devis', onBtn: onAddDoc,
      });
    }
  }

  // Pas de lots du tout
  if (lots.length === 0) {
    alerts.push({
      type: 'tip', icon: '💡',
      text: 'Commencez par créer vos intervenants pour suivre votre budget poste par poste.',
    });
  }

  // Tout est couvert
  if (alerts.length === 0 && lots.length > 0) {
    const multiDevis = lots.filter(l =>
      documents.filter(d => d.lot_id === l.id && d.document_type === 'devis').length >= 2
    ).length;
    alerts.push({
      type: 'ok', icon: '✅',
      text: `${multiDevis}/${lots.length} intervenant${lots.length > 1 ? 's' : ''} avec 2 devis ou plus — bonne progression !`,
    });
  }

  return alerts.slice(0, 4); // max 4 alertes
}

function AlertesIA({ lots, documents, onAddDoc, onGoToLot }: {
  lots: LotChantier[];
  documents: DocumentChantier[];
  onAddDoc: () => void;
  onGoToLot?: (id: string) => void;
}) {
  const alerts = useMemo(
    () => computeActionAlerts(lots, documents, onAddDoc, onGoToLot),
    [lots, documents],
  );

  const STYLES: Record<ActionAlert['type'], { bg: string; border: string; text: string }> = {
    alert:   { bg: 'bg-red-50',     border: 'border-red-100',     text: 'text-red-800'     },
    warning: { bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-800'   },
    tip:     { bg: 'bg-blue-50',    border: 'border-blue-100',    text: 'text-blue-800'    },
    ok:      { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-800' },
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-violet-500" />
        <h3 className="font-semibold text-gray-900">Alertes actionnables</h3>
      </div>

      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const s = STYLES[alert.type];
          return (
            <div key={i} className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border ${s.bg} ${s.border}`}>
              <span className="text-base shrink-0 mt-0.5">{alert.icon}</span>
              <p className={`flex-1 text-sm font-medium ${s.text} leading-snug`}>{alert.text}</p>
              {alert.btn && alert.onBtn && (
                <button onClick={alert.onBtn}
                  className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-all whitespace-nowrap">
                  {alert.btn}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AlertesIA;
