/**
 * DocumentsView — bibliothèque de documents du chantier.
 *
 * Vue "réceptacle" : aucune action de workflow (statut, relance, paiement).
 * Seules actions : renommer, changer l'intervenant, ouvrir, supprimer.
 *
 * Sections dépliables :
 *   📋 Devis · 🧾 Factures · 🛒 Achats & tickets · 📷 Photos · 📐 Plans · 📁 Docs administratifs
 *
 * Photos : miniature img à la place de l'icône emoji.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FolderOpen, Plus, Search, X, ExternalLink, Pencil,
  Loader2, Trash2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentChantier, LotChantier } from '@/types/chantier-ia';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function isImageMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return mime.startsWith('image/');
}

// ── Sections config ───────────────────────────────────────────────────────────

type SectionKey = 'devis' | 'factures' | 'achats' | 'photos' | 'plans' | 'admin';

interface Section {
  key:         SectionKey;
  label:       string;
  emoji:       string;
  headerCls:   string;
  countCls:    string;
  filter:      (doc: DocumentChantier) => boolean;
}

const SECTIONS: Section[] = [
  {
    key:       'devis',
    label:     'Devis',
    emoji:     '📋',
    headerCls: 'bg-blue-50/60 hover:bg-blue-50',
    countCls:  'bg-blue-100 text-blue-700',
    filter:    d => d.document_type === 'devis',
  },
  {
    key:       'factures',
    label:     'Factures',
    emoji:     '🧾',
    headerCls: 'bg-emerald-50/60 hover:bg-emerald-50',
    countCls:  'bg-emerald-100 text-emerald-700',
    filter:    d =>
      d.document_type === 'facture' &&
      (!('depense_type' in d) || !(d as any).depense_type ||
       (d as any).depense_type === 'facture'),
  },
  {
    key:       'achats',
    label:     'Achats & tickets',
    emoji:     '🛒',
    headerCls: 'bg-purple-50/60 hover:bg-purple-50',
    countCls:  'bg-purple-100 text-purple-700',
    filter:    d =>
      d.document_type === 'facture' &&
      ('depense_type' in d) &&
      ((d as any).depense_type === 'ticket_caisse' || (d as any).depense_type === 'achat_materiaux'),
  },
  {
    key:       'photos',
    label:     'Photos',
    emoji:     '📷',
    headerCls: 'bg-violet-50/60 hover:bg-violet-50',
    countCls:  'bg-violet-100 text-violet-700',
    filter:    d => d.document_type === 'photo',
  },
  {
    key:       'plans',
    label:     'Plans',
    emoji:     '📐',
    headerCls: 'bg-amber-50/60 hover:bg-amber-50',
    countCls:  'bg-amber-100 text-amber-700',
    filter:    d => d.document_type === 'plan',
  },
  {
    key:       'admin',
    label:     'Documents administratifs',
    emoji:     '📁',
    headerCls: 'bg-gray-50/80 hover:bg-gray-100',
    countCls:  'bg-gray-100 text-gray-600',
    filter:    d => ['autorisation', 'assurance', 'autre', 'preuve_paiement'].includes(d.document_type),
  },
];

// ── LotBadge ──────────────────────────────────────────────────────────────────

function LotBadge({ doc, lots, onChangeLot }: {
  doc:          DocumentChantier;
  lots:         LotChantier[];
  onChangeLot:  (docId: string, lotId: string | null) => void;
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
        className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg border transition-colors whitespace-nowrap ${
          lot
            ? 'border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100'
            : 'border-gray-200 text-gray-400 bg-gray-50 hover:bg-gray-100 hover:text-gray-600'
        }`}
      >
        <span className="text-[10px]">{lot ? `${lot.emoji ?? '🔧'} ${lot.nom}` : '—'}</span>
        <ChevronDown className="h-2.5 w-2.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 z-30 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden min-w-[180px]">
          <button
            onClick={() => { onChangeLot(doc.id, null); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
          >
            — Sans intervenant
          </button>
          {lots.map(l => (
            <button
              key={l.id}
              onClick={() => { onChangeLot(doc.id, l.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center gap-2 ${
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

// ── PhotoThumb ────────────────────────────────────────────────────────────────

function PhotoThumb({ url, nom }: { url: string | null | undefined; nom: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 text-lg">
        📷
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={nom}
      onError={() => setFailed(true)}
      className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-100"
    />
  );
}

// ── DocRow ────────────────────────────────────────────────────────────────────

function DocRow({ doc, lots, chantierId, token, sectionKey, onDelete, onLotChange, onNomChange, pendingDescribeIds }: {
  doc:                DocumentChantier;
  lots:               LotChantier[];
  chantierId:         string;
  token:              string;
  sectionKey:         SectionKey;
  onDelete:           (id: string) => void;
  onLotChange:        (docId: string, lotId: string | null) => void;
  onNomChange:        (docId: string, nom: string) => void;
  pendingDescribeIds: string[];
}) {
  const [editing,  setEditing]  = useState(false);
  const [editName, setEditName] = useState('');
  const [saving,   setSaving]   = useState(false);
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
      if (res.ok) onNomChange(doc.id, trimmed);
      else toast.error('Impossible de renommer');
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); setEditing(false); }
  }

  const isPhoto   = sectionKey === 'photos';
  const isFacture = doc.document_type === 'facture';

  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0">

      {/* Icône / miniature */}
      {isPhoto ? (
        <PhotoThumb url={doc.signedUrl} nom={doc.nom} />
      ) : (
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gray-50 text-lg border border-gray-100">
          {SECTIONS.find(s => s.key === sectionKey)?.emoji ?? '📄'}
        </div>
      )}

      {/* Nom + meta + badge */}
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
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <p className="text-[11px] text-gray-400">{fmtDate(doc.created_at)}</p>
          {doc.taille_octets && (
            <p className="text-[11px] text-gray-300">{fmtSize(doc.taille_octets)}</p>
          )}
          {isFacture && doc.montant != null && doc.montant > 0 && (
            <p className="text-[11px] font-semibold text-gray-600 tabular-nums">
              {doc.montant.toLocaleString('fr-FR')} €
            </p>
          )}
          <LotBadge doc={doc} lots={lots} onChangeLot={onLotChange} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {doc.signedUrl && (
          <a
            href={doc.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
            title="Ouvrir"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Ouvrir</span>
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

// ── SectionBlock ──────────────────────────────────────────────────────────────

function SectionBlock({ section, docs, lots, chantierId, token, open, onToggle, onDelete, onLotChange, onNomChange, pendingDescribeIds }: {
  section:            Section;
  docs:               DocumentChantier[];
  lots:               LotChantier[];
  chantierId:         string;
  token:              string;
  open:               boolean;
  onToggle:           () => void;
  onDelete:           (id: string) => void;
  onLotChange:        (docId: string, lotId: string | null) => void;
  onNomChange:        (docId: string, nom: string) => void;
  pendingDescribeIds: string[];
}) {
  if (docs.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Header cliquable */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left ${section.headerCls}`}
      >
        <span className="text-lg leading-none shrink-0">{section.emoji}</span>
        <span className="font-bold text-gray-900 text-sm flex-1">{section.label}</span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${section.countCls}`}>
          {docs.length}
        </span>
        {open
          ? <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        }
      </button>

      {/* Contenu dépliable */}
      {open && (
        <div className="divide-y divide-gray-50">
          {docs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              lots={lots}
              chantierId={chantierId}
              token={token}
              sectionKey={section.key}
              onDelete={onDelete}
              onLotChange={onLotChange}
              onNomChange={onNomChange}
              pendingDescribeIds={pendingDescribeIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function DocumentsView({
  documents, lots: lotsProp, chantierId, token,
  onAddDoc, onDeleteDoc, onDocUpdated, onDocLotUpdated, onDocNomUpdated,
  pendingDescribeIds = [],
}: {
  documents:           DocumentChantier[];
  lots:                LotChantier[];
  chantierId:          string;
  token:               string;
  onAddDoc:            () => void;
  onDeleteDoc:         (id: string) => void;
  onDocUpdated:        () => void;
  onDocLotUpdated?:    (docId: string, lotId: string | null) => void;
  onDocNomUpdated?:    (docId: string, nom: string) => void;
  onDocStatutUpdated?: (docId: string, statut: string) => void;
  onDocMontantPayeUpdated?: (docId: string, montantPaye: number) => void;
  pendingDescribeIds?: string[];
}) {
  const [search,      setSearch]      = useState('');
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(
    () => new Set(['devis', 'factures']),
  );
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

  // Documents avec overrides de lot
  const docsWithOverrides = useMemo(() =>
    documents.map(d => ({
      ...d,
      lot_id: lotOverrides[d.id] !== undefined ? lotOverrides[d.id] : d.lot_id,
    })),
  [documents, lotOverrides]);

  // Filtrage par recherche
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return docsWithOverrides;
    return docsWithOverrides.filter(doc => {
      const lot = realLots.find(l => l.id === doc.lot_id);
      return (
        doc.nom.toLowerCase().includes(q) ||
        (lot?.nom.toLowerCase().includes(q) ?? false)
      );
    });
  }, [docsWithOverrides, search, realLots]);

  // Docs par section
  const docsBySection = useMemo(() =>
    SECTIONS.map(s => ({ section: s, docs: filtered.filter(s.filter) })),
  [filtered]);

  const totalVisible = docsBySection.reduce((n, g) => n + g.docs.length, 0);

  function toggleSection(key: SectionKey) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleChangeLot(docId: string, lotId: string | null) {
    setLotOverrides(prev => ({ ...prev, [docId]: lotId }));
    try {
      const res = await fetch(`/api/chantier/${chantierId}/documents/${docId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lotId }),
      });
      if (res.ok) { onDocLotUpdated?.(docId, lotId); }
      else {
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

  return (
    <div className="flex flex-col h-full">

      {/* ── Barre de recherche ──────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-3 border-b border-gray-100 bg-white">
        {/* Chips résumé */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {docsBySection.filter(g => g.docs.length > 0).map(({ section, docs }) => (
            <button
              key={section.key}
              onClick={() => {
                setOpenSections(prev => {
                  const next = new Set(prev);
                  next.add(section.key);
                  return next;
                });
                // Scroll to section (simple UX)
              }}
              className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${section.countCls} hover:opacity-80 transition-opacity`}
            >
              {section.emoji} {docs.length}
            </button>
          ))}
          <span className="text-[11px] text-gray-400 ml-auto">
            {documents.length} document{documents.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un document, un artisan…"
            className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Sections dépliables ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

        {search && totalVisible === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-8 w-8 text-gray-200 mb-3" />
            <p className="font-semibold text-gray-700 mb-1">Aucun résultat</p>
            <p className="text-sm text-gray-400">Aucun document ne correspond à « {search} »</p>
            <button onClick={() => setSearch('')} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
              Effacer la recherche
            </button>
          </div>
        )}

        {docsBySection.map(({ section, docs }) => (
          <SectionBlock
            key={section.key}
            section={section}
            docs={docs}
            lots={realLots}
            chantierId={chantierId}
            token={token}
            open={openSections.has(section.key)}
            onToggle={() => toggleSection(section.key)}
            onDelete={onDeleteDoc}
            onLotChange={handleChangeLot}
            onNomChange={(id, nom) => onDocNomUpdated?.(id, nom)}
            pendingDescribeIds={pendingDescribeIds}
          />
        ))}

        {/* Bouton ajouter */}
        <button
          onClick={onAddDoc}
          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/30 transition-all"
        >
          <Plus className="h-4 w-4" /> Ajouter un document
        </button>
      </div>
    </div>
  );
}
