import { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileText, FolderOpen, Loader2, Pencil, Plus, Trash2, Search, X,
  ExternalLink, ChevronDown, Image, Receipt, FileStack, Shield, BookOpen, File,
  ArrowDownUp, CalendarDays, ALargeSmall, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentChantier, DocumentType, LotChantier } from '@/types/chantier-ia';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ── Config types ──────────────────────────────────────────────────────────────

const TYPE_CFG: Record<DocumentType, {
  label: string; plural: string; emoji: string;
  iconBg: string; iconText: string; tabBg: string; tabText: string; tabActiveBg: string; tabActiveText: string;
}> = {
  devis:        { label: 'Devis',        plural: 'Devis',          emoji: '📋', iconBg: 'bg-blue-50',    iconText: 'text-blue-500',   tabBg: 'bg-white', tabText: 'text-gray-500', tabActiveBg: 'bg-blue-600',   tabActiveText: 'text-white' },
  facture:      { label: 'Facture',      plural: 'Factures',       emoji: '🧾', iconBg: 'bg-emerald-50', iconText: 'text-emerald-500',tabBg: 'bg-white', tabText: 'text-gray-500', tabActiveBg: 'bg-emerald-600',tabActiveText: 'text-white' },
  photo:        { label: 'Photo',        plural: 'Photos',         emoji: '📷', iconBg: 'bg-violet-50',  iconText: 'text-violet-500', tabBg: 'bg-white', tabText: 'text-gray-500', tabActiveBg: 'bg-violet-600', tabActiveText: 'text-white' },
  plan:         { label: 'Plan',         plural: 'Plans',          emoji: '📐', iconBg: 'bg-amber-50',   iconText: 'text-amber-500',  tabBg: 'bg-white', tabText: 'text-gray-500', tabActiveBg: 'bg-amber-500',  tabActiveText: 'text-white' },
  autorisation: { label: 'Autorisation', plural: 'Autorisations',  emoji: '📜', iconBg: 'bg-orange-50',  iconText: 'text-orange-500', tabBg: 'bg-white', tabText: 'text-gray-500', tabActiveBg: 'bg-orange-500', tabActiveText: 'text-white' },
  assurance:    { label: 'Assurance',    plural: 'Assurances',     emoji: '🛡', iconBg: 'bg-indigo-50',  iconText: 'text-indigo-500', tabBg: 'bg-white', tabText: 'text-gray-500', tabActiveBg: 'bg-indigo-600', tabActiveText: 'text-white' },
  autre:        { label: 'Autre',        plural: 'Autres',         emoji: '📁', iconBg: 'bg-gray-50',    iconText: 'text-gray-400',   tabBg: 'bg-white', tabText: 'text-gray-500', tabActiveBg: 'bg-gray-700',   tabActiveText: 'text-white' },
};

// Ordre d'affichage des onglets
const TAB_ORDER: DocumentType[] = ['devis', 'facture', 'photo', 'autorisation', 'assurance', 'plan', 'autre'];

// ── LotBadge — selector inline ────────────────────────────────────────────────

function LotBadge({ doc, lots, onChangeLot }: {
  doc: DocumentChantier;
  lots: LotChantier[];
  onChangeLot: (docId: string, lotId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lot = lots.find(l => l.id === doc.lot_id);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
          lot
            ? 'border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100'
            : 'border-gray-200 text-gray-400 bg-gray-50 hover:bg-gray-100 hover:text-gray-600'
        }`}
      >
        <span>{lot ? `${lot.emoji ?? '🔧'} ${lot.nom}` : '— Aucun intervenant'}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden min-w-[200px]">
          <button
            onClick={() => { onChangeLot(doc.id, null); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
          >
            — Aucun intervenant
          </button>
          {lots.map(l => (
            <button
              key={l.id}
              onClick={() => { onChangeLot(doc.id, l.id); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 ${
                l.id === doc.lot_id ? 'bg-purple-50 text-purple-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{l.emoji ?? '🔧'}</span>
              <span className="truncate">{l.nom}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DocRow ────────────────────────────────────────────────────────────────────

function DocRow({ doc, lots, chantierId, token, onDelete, onLotChange, onNomChange, pendingDescribeIds }: {
  doc: DocumentChantier;
  lots: LotChantier[];
  chantierId: string;
  token: string;
  onDelete: (id: string) => void;
  onLotChange: (docId: string, lotId: string | null) => void;
  onNomChange: (docId: string, nom: string) => void;
  pendingDescribeIds: string[];
}) {
  const [editing, setEditing]   = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving]     = useState(false);
  const cfg = TYPE_CFG[doc.document_type];
  const isDescribing = pendingDescribeIds.includes(doc.id);

  async function saveRename() {
    const trimmed = editName.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: trimmed }),
      });
      if (res.ok) { onNomChange(doc.id, trimmed); }
      else { toast.error('Impossible de renommer'); }
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); setEditing(false); }
  }

  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors border-b border-gray-50 last:border-0">
      {/* Icône type */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
        <span className="text-base leading-none">{cfg.emoji}</span>
      </div>

      {/* Nom + date */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(false); }}
              onBlur={saveRename}
              className="flex-1 min-w-0 text-sm font-medium bg-blue-50 border border-blue-300 rounded-lg px-2.5 py-1 outline-none focus:ring-2 focus:ring-blue-200"
            />
            {saving && <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {isDescribing ? (
              <span className="flex items-center gap-1.5 text-sm text-blue-400 italic">
                <Loader2 className="h-3 w-3 animate-spin" /> IA en cours…
              </span>
            ) : (
              <span
                className="text-sm font-medium text-gray-800 truncate cursor-pointer hover:text-blue-600 transition-colors"
                title={doc.nom}
                onClick={() => { setEditing(true); setEditName(doc.nom); }}
              >
                {doc.nom}
              </span>
            )}
            {!isDescribing && (
              <button
                onClick={() => { setEditing(true); setEditName(doc.nom); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-300 hover:text-blue-500 transition-all shrink-0"
                title="Renommer"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-0.5">{fmtDate(doc.created_at)}</p>
      </div>

      {/* Intervenant */}
      <LotBadge doc={doc} lots={lots} onChangeLot={onLotChange} />

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {doc.signedUrl && (
          <a
            href={doc.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
            title="Ouvrir le fichier"
          >
            Ouvrir <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {doc.analyse_id && (
          <a
            href={`/analyse/${doc.analyse_id}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            Analyse →
          </a>
        )}
        <button
          onClick={() => onDelete(doc.id)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
          title="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Component principal ───────────────────────────────────────────────────────

export default function DocumentsView({
  documents, lots: lotsProp, chantierId, token,
  onAddDoc, onDeleteDoc, onDocUpdated, onDocLotUpdated, onDocNomUpdated,
  pendingDescribeIds = [],
}: {
  documents: DocumentChantier[];
  lots: LotChantier[];
  chantierId: string;
  token: string;
  onAddDoc: () => void;
  onDeleteDoc: (id: string) => void;
  onDocUpdated: () => void;
  onDocLotUpdated?: (docId: string, lotId: string | null) => void;
  onDocNomUpdated?: (docId: string, nom: string) => void;
  pendingDescribeIds?: string[];
}) {
  const [search, setSearch]         = useState('');
  const [activeTab, setActiveTab]   = useState<DocumentType | 'all'>('all');
  const [sortBy, setSortBy]         = useState<'date' | 'alpha' | 'intervenant'>('date');
  const [lotOverrides, setLotOverrides] = useState<Record<string, string | null>>({});

  // Lots réels depuis la DB
  const [dbLots, setDbLots] = useState<LotChantier[]>([]);
  useEffect(() => {
    if (!chantierId || !token) return;
    fetch(`/api/chantier/${chantierId}/lots`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.lots) setDbLots(d.lots); })
      .catch(() => {});
  }, [chantierId, token]);
  const realLots = (dbLots.length > 0 ? dbLots : lotsProp).filter(l => !l.id.startsWith('fallback-'));

  // Documents avec overrides de lot appliqués
  const docsWithOverrides = useMemo(() =>
    documents.map(d => ({
      ...d,
      lot_id: lotOverrides[d.id] !== undefined ? lotOverrides[d.id] : d.lot_id,
    })),
  [documents, lotOverrides]);

  // Filtrage recherche + onglet + tri
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = docsWithOverrides.filter(doc => {
      if (activeTab !== 'all' && doc.document_type !== activeTab) return false;
      if (!q) return true;
      const lot = realLots.find(l => l.id === doc.lot_id);
      return (
        doc.nom.toLowerCase().includes(q) ||
        doc.document_type.includes(q) ||
        (lot?.nom.toLowerCase().includes(q) ?? false)
      );
    });

    return [...base].sort((a, b) => {
      if (sortBy === 'alpha') return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
      if (sortBy === 'intervenant') {
        const la = realLots.find(l => l.id === a.lot_id)?.nom ?? '';
        const lb = realLots.find(l => l.id === b.lot_id)?.nom ?? '';
        const cmp = la.localeCompare(lb, 'fr', { sensitivity: 'base' });
        return cmp !== 0 ? cmp : a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
      }
      // date desc par défaut
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [docsWithOverrides, activeTab, search, sortBy, realLots]);

  // Compteurs par type
  const counts = useMemo(() => {
    const c: Partial<Record<DocumentType, number>> = {};
    for (const d of docsWithOverrides) c[d.document_type] = (c[d.document_type] ?? 0) + 1;
    return c;
  }, [docsWithOverrides]);

  const tabs = TAB_ORDER.filter(t => (counts[t] ?? 0) > 0);

  async function handleChangeLot(docId: string, lotId: string | null) {
    setLotOverrides(prev => ({ ...prev, [docId]: lotId }));
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId }),
      });
      if (res.ok) {
        onDocLotUpdated?.(docId, lotId);
      } else {
        toast.error("Impossible d'affecter l'intervenant");
        setLotOverrides(prev => { const n = { ...prev }; delete n[docId]; return n; });
      }
    } catch {
      toast.error('Erreur réseau');
      setLotOverrides(prev => { const n = { ...prev }; delete n[docId]; return n; });
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <FolderOpen className="h-12 w-12 text-gray-200 mx-auto mb-4" />
        <p className="font-bold text-gray-900 mb-1 text-lg">Aucun document</p>
        <p className="text-sm text-gray-400 mb-6 max-w-sm">
          Importez vos devis, factures, photos de chantier, plans, autorisations et assurances
        </p>
        <button
          onClick={onAddDoc}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Ajouter un document
        </button>
      </div>
    );
  }

  // ── Stats bar ─────────────────────────────────────────────────────────────
  const statsOrder: DocumentType[] = ['devis', 'facture', 'photo', 'autorisation', 'assurance', 'plan', 'autre'];

  return (
    <div className="flex flex-col h-full">

      {/* ── Barre de recherche + stats ───────────────────────────────── */}
      <div className="px-6 pt-4 pb-3 border-b border-gray-100 bg-white">
        {/* Stats chips */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {statsOrder.filter(t => (counts[t] ?? 0) > 0).map(t => {
            const cfg = TYPE_CFG[t];
            return (
              <span key={t} className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${cfg.iconBg} ${cfg.iconText}`}>
                {cfg.emoji} {counts[t]} {cfg.plural}
              </span>
            );
          })}
          <span className="text-[11px] text-gray-400 ml-auto">
            {documents.length} document{documents.length > 1 ? 's' : ''} au total
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un constat, permis de construire, photo, artisan…"
            className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Onglets type + contrôles de tri ─────────────────────────── */}
      <div className="flex items-center gap-1.5 px-6 py-3 border-b border-gray-100 bg-white overflow-x-auto">
        {/* Onglets */}
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
            activeTab === 'all'
              ? 'bg-gray-900 text-white'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          Tous ({documents.length})
        </button>
        {tabs.map(t => {
          const cfg = TYPE_CFG[t];
          const active = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                active ? `${cfg.tabActiveBg} ${cfg.tabActiveText}` : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {cfg.emoji} {cfg.plural} ({counts[t]})
            </button>
          );
        })}

        {/* Séparateur + tri */}
        <div className="ml-auto flex items-center gap-1 shrink-0 pl-2 border-l border-gray-100">
          <button
            onClick={() => setSortBy('date')}
            title="Trier par date de dépôt"
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-all ${
              sortBy === 'date'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            <CalendarDays className="h-3 w-3" />
            <span className="hidden sm:inline">Date</span>
          </button>
          <button
            onClick={() => setSortBy('alpha')}
            title="Trier par ordre alphabétique"
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-all ${
              sortBy === 'alpha'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            <ALargeSmall className="h-3 w-3" />
            <span className="hidden sm:inline">A→Z</span>
          </button>
          <button
            onClick={() => setSortBy('intervenant')}
            title="Grouper par intervenant"
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-all ${
              sortBy === 'intervenant'
                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            <Wrench className="h-3 w-3" />
            <span className="hidden sm:inline">Intervenant</span>
          </button>
        </div>
      </div>

      {/* ── Liste documents ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-8 w-8 text-gray-200 mb-3" />
            <p className="font-semibold text-gray-700 mb-1">Aucun résultat</p>
            <p className="text-sm text-gray-400">
              {search ? `Aucun document ne correspond à « ${search} »` : 'Aucun document dans cette catégorie'}
            </p>
            {search && (
              <button onClick={() => setSearch('')} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
                Effacer la recherche
              </button>
            )}
          </div>
        ) : activeTab === 'all' && sortBy === 'intervenant' ? (
          // Mode "Tous" + tri intervenant : regroupé par lot
          <div className="space-y-4">
            {(() => {
              const groups: { lotId: string | null; lot: LotChantier | null; docs: typeof filtered }[] = [];
              const seen = new Set<string | null>();
              for (const doc of filtered) {
                const key = doc.lot_id ?? null;
                if (!seen.has(key)) {
                  seen.add(key);
                  groups.push({
                    lotId: key,
                    lot: key ? (realLots.find(l => l.id === key) ?? null) : null,
                    docs: [],
                  });
                }
              }
              // Rempli les docs dans chaque groupe
              for (const doc of filtered) {
                const g = groups.find(g => g.lotId === (doc.lot_id ?? null));
                if (g) g.docs.push(doc);
              }
              // Trier groupes : lots nommés d'abord (alpha), puis "Sans intervenant"
              groups.sort((a, b) => {
                if (!a.lot && b.lot) return 1;
                if (a.lot && !b.lot) return -1;
                return (a.lot?.nom ?? '').localeCompare(b.lot?.nom ?? '', 'fr', { sensitivity: 'base' });
              });
              return groups.map(({ lot, docs }) => (
                <div key={lot?.id ?? '__none__'} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 bg-purple-50/40">
                    <span className="text-base leading-none">{lot ? (lot.emoji ?? '🔧') : '📁'}</span>
                    <span className="font-bold text-gray-900 text-sm">
                      {lot ? lot.nom : 'Sans intervenant'}
                    </span>
                    <span className="text-xs text-gray-400 font-normal ml-0.5">({docs.length})</span>
                  </div>
                  {docs.map(doc => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      lots={realLots}
                      chantierId={chantierId}
                      token={token}
                      onDelete={onDeleteDoc}
                      onLotChange={handleChangeLot}
                      onNomChange={(id, nom) => onDocNomUpdated?.(id, nom)}
                      pendingDescribeIds={pendingDescribeIds}
                    />
                  ))}
                </div>
              ));
            })()}
            <button
              onClick={onAddDoc}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
            >
              <Plus className="h-4 w-4" /> Ajouter un document
            </button>
          </div>
        ) : activeTab === 'all' ? (
          // Mode "Tous" : regroupé par type
          <div className="space-y-4">
            {TAB_ORDER.filter(t => filtered.some(d => d.document_type === t)).map(t => {
              const cfg = TYPE_CFG[t];
              const group = filtered.filter(d => d.document_type === t);
              return (
                <div key={t} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className={`flex items-center gap-2 px-4 py-3 border-b border-gray-50`}>
                    <span className="text-base leading-none">{cfg.emoji}</span>
                    <span className="font-bold text-gray-900 text-sm">{cfg.plural}</span>
                    <span className="text-xs text-gray-400 font-normal ml-0.5">({group.length})</span>
                    <button
                      onClick={() => setActiveTab(t)}
                      className="ml-auto text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      Voir tous →
                    </button>
                  </div>
                  {group.map(doc => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      lots={realLots}
                      chantierId={chantierId}
                      token={token}
                      onDelete={onDeleteDoc}
                      onLotChange={handleChangeLot}
                      onNomChange={(id, nom) => onDocNomUpdated?.(id, nom)}
                      pendingDescribeIds={pendingDescribeIds}
                    />
                  ))}
                </div>
              );
            })}
            {/* Bouton ajout en bas */}
            <button
              onClick={onAddDoc}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
            >
              <Plus className="h-4 w-4" /> Ajouter un document
            </button>
          </div>
        ) : (
          // Mode onglet spécifique : liste plate
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header du groupe */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <span className="text-base">{TYPE_CFG[activeTab].emoji}</span>
              <span className="font-bold text-gray-900 text-sm">{TYPE_CFG[activeTab].plural}</span>
              <span className="text-xs text-gray-400">({filtered.length})</span>
            </div>
            {/* En-tête colonnes */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 border-b border-gray-50 bg-gray-50/40">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Document</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Intervenant</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Actions</span>
            </div>
            {filtered.map(doc => (
              <DocRow
                key={doc.id}
                doc={doc}
                lots={realLots}
                chantierId={chantierId}
                token={token}
                onDelete={onDeleteDoc}
                onLotChange={handleChangeLot}
                onNomChange={(id, nom) => onDocNomUpdated?.(id, nom)}
                pendingDescribeIds={pendingDescribeIds}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
