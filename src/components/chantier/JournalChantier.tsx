import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import type { DocumentChantier, DocumentType } from '@/types/chantier-ia';

// ── Config événements ─────────────────────────────────────────────────────────

interface EventConfig {
  emoji: string;
  label: string;
}

const EVENT_CONFIG: Record<DocumentType, EventConfig> = {
  devis:        { emoji: '📋', label: 'Devis ajouté'         },
  facture:      { emoji: '💰', label: 'Facture ajoutée'       },
  photo:        { emoji: '📸', label: 'Photo ajoutée'         },
  plan:         { emoji: '📐', label: 'Plan ajouté'           },
  autorisation: { emoji: '🏛️', label: 'Autorisation ajoutée'  },
  assurance:    { emoji: '🛡️', label: 'Assurance ajoutée'     },
  autre:        { emoji: '📄', label: 'Document ajouté'       },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const now      = new Date();
  const date     = new Date(iso);
  const diffMs   = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7)   return `Il y a ${diffDays} jours`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Types internes ────────────────────────────────────────────────────────────

interface ActivityItem {
  id:           string;
  emoji:        string;
  label:        string;
  nom:          string;
  relativeDate: string;
}

function buildActivities(documents: DocumentChantier[], limit = 20): ActivityItem[] {
  return [...documents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((doc) => {
      const cfg = EVENT_CONFIG[doc.document_type] ?? EVENT_CONFIG.autre;
      return {
        id:           doc.id,
        emoji:        cfg.emoji,
        label:        cfg.label,
        nom:          doc.nom,
        relativeDate: formatRelative(doc.created_at),
      };
    });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface JournalChantierProps {
  chantierId?: string | null;
  token?: string | null;
  limit?: number;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function JournalChantier({ chantierId, token, limit = 20 }: JournalChantierProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading]       = useState(false);

  const fetchActivities = useCallback(async () => {
    if (!chantierId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setActivities(buildActivities((data.documents ?? []) as DocumentChantier[], limit));
    } catch {
      // Journal non critique — silencieux en cas d'erreur réseau
    } finally {
      setLoading(false);
    }
  }, [chantierId, token]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  return (
    <div className="bg-[#0d1525] border border-white/[0.06] rounded-2xl overflow-hidden">

      {/* En-tête */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.05]">
        <BookOpen className="h-4 w-4 text-slate-400" />
        <span className="text-white font-semibold text-sm">Journal d'activité</span>
        {!loading && activities.length > 0 && (
          <span className="ml-auto text-xs text-slate-600">
            {activities.length} événement{activities.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Corps */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 text-slate-700 animate-spin" />
        </div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-5">
          <span className="text-3xl mb-3">📭</span>
          <p className="text-slate-500 text-sm font-medium">Aucune activité pour l'instant</p>
          <p className="text-slate-700 text-xs mt-1">
            Les événements apparaîtront ici au fur et à mesure de l'avancement.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {activities.map((activity, i) => (
            <li key={activity.id} className="flex items-start gap-3 px-5 py-3.5">

              {/* Icône + connecteur vertical */}
              <div className="flex flex-col items-center shrink-0 pt-0.5">
                <span className="text-base leading-none">{activity.emoji}</span>
                {i < activities.length - 1 && (
                  <div
                    className="w-px flex-1 bg-white/[0.05] mt-2"
                    style={{ minHeight: '0.875rem' }}
                  />
                )}
              </div>

              {/* Contenu */}
              <div className="flex-1 min-w-0">
                <p className="text-slate-200 text-sm font-medium leading-snug">
                  {activity.label}
                </p>
                <p className="text-slate-500 text-xs mt-0.5 truncate">{activity.nom}</p>
              </div>

              {/* Date relative */}
              <span className="text-[11px] text-slate-600 shrink-0 mt-0.5 whitespace-nowrap">
                {activity.relativeDate}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
