/**
 * ContactsSection — Carnet de contacts du chantier.
 * Affiche les artisans des devis/factures + contacts manuels.
 * Permet d'ajouter, modifier, rattacher à un lot.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Phone, Mail, ExternalLink, Building2, X, Loader2,
  Pencil, Trash2, Link2, User, Search, FileText, Layers, Check,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  siret: string | null;
  role: string | null;
  lot_id: string | null;
  notes: string | null;
  source: 'manual' | 'devis' | 'facture';
  devis_id: string | null;
  analyse_id: string | null;
  created_at: string;
}

interface AnalyseArtisan {
  analyse_id: string;
  nom: string;
  nom_officiel: string | null;
  siret: string | null;
  email: string | null;
  telephone: string | null;
  lot_id: string | null;
}

interface Lot {
  id: string;
  nom: string;
}

interface Props {
  chantierId: string;
  token: string;
}

// ── Unified contact row ─────────────────────────────────────────────────────

interface UnifiedContact {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  siret: string | null;
  role: string | null;
  lotId: string | null;
  lotNom: string | null;
  source: 'manual' | 'devis' | 'analyse';
  analyseId: string | null;
  devisId: string | null;
  dbContact: Contact | null;
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function ContactsSection({ chantierId, token }: Props) {
  const [contacts, setContacts]               = useState<Contact[]>([]);
  const [analyseArtisans, setAnalyseArtisans] = useState<AnalyseArtisan[]>([]);
  const [lots, setLots]                       = useState<Lot[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [showForm, setShowForm]         = useState(false);
  const [editContact, setEditContact]   = useState<UnifiedContact | null>(null);
  const [saving, setSaving]             = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────

  const fetchContacts = useCallback(async () => {
    const res = await fetch(`/api/chantier/${chantierId}/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setAnalyseArtisans(data.analyseArtisans ?? []);
    setLots(data.lots ?? []);
    setLoading(false);
  }, [chantierId, token]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Auto-persist : quand des contacts DB ont email/tél enrichis depuis l'analyse, les sauvegarder
  useEffect(() => {
    if (!contacts.length || !analyseArtisans.length) return;
    const updates: Array<{ id: string; email?: string; telephone?: string }> = [];
    for (const c of contacts) {
      if (c.email && c.telephone) continue; // déjà complet
      const artisan = (c.analyse_id ? artisanByAnalyseId.get(c.analyse_id) : null)
        ?? (c.siret ? artisanBySiret.get(c.siret) : null);
      if (!artisan) continue;
      const patch: { id: string; email?: string; telephone?: string } = { id: c.id };
      if (!c.email && artisan.email) patch.email = artisan.email;
      if (!c.telephone && artisan.telephone) patch.telephone = artisan.telephone;
      if (patch.email || patch.telephone) updates.push(patch);
    }
    if (!updates.length) return;
    // PATCH silencieux fire-and-forget pour chaque contact enrichi
    Promise.all(updates.map(u =>
      fetch(`/api/chantier/${chantierId}/contacts`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: u.id, email: u.email, telephone: u.telephone }),
      }).catch(() => {}),
    )).then(() => { if (updates.length) fetchContacts(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, analyseArtisans]);

  // ── Build unified list ────────────────────────────────────────────────

  const lotMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lots) m.set(l.id, l.nom);
    return m;
  }, [lots]);

  // Index des artisans extraits par analyse_id et siret pour enrichissement auto
  const artisanByAnalyseId = useMemo(() => {
    const m = new Map<string, typeof analyseArtisans[0]>();
    for (const a of analyseArtisans) m.set(a.analyse_id, a);
    return m;
  }, [analyseArtisans]);

  const artisanBySiret = useMemo(() => {
    const m = new Map<string, typeof analyseArtisans[0]>();
    for (const a of analyseArtisans) { if (a.siret) m.set(a.siret, a); }
    return m;
  }, [analyseArtisans]);

  const unified = useMemo(() => {
    const result: UnifiedContact[] = [];
    const seenSirets = new Set<string>();
    const seenNames  = new Set<string>();

    // 1) Contacts from DB (manual or previously saved)
    for (const c of contacts) {
      if (c.siret) seenSirets.add(c.siret);
      seenNames.add(c.nom.toLowerCase());

      // Enrichissement auto : si le contact n'a pas d'email/tél, les chercher dans l'analyse liée
      let email = c.email;
      let telephone = c.telephone;
      if (!email || !telephone) {
        const artisan = (c.analyse_id ? artisanByAnalyseId.get(c.analyse_id) : null)
          ?? (c.siret ? artisanBySiret.get(c.siret) : null);
        if (artisan) {
          email = email || artisan.email;
          telephone = telephone || artisan.telephone;
        }
      }

      result.push({
        id: c.id,
        nom: c.nom,
        email,
        telephone,
        siret: c.siret,
        role: c.role,
        lotId: c.lot_id,
        lotNom: c.lot_id ? lotMap.get(c.lot_id) ?? null : null,
        source: c.source as 'manual' | 'devis' | 'analyse',
        analyseId: c.analyse_id,
        devisId: c.devis_id,
        dbContact: c,
      });
    }

    // 2) Artisans from analyses (deduplicated by SIRET then name)
    for (const a of analyseArtisans) {
      if (a.siret && seenSirets.has(a.siret)) continue;
      const nameKey = a.nom.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      if (a.siret) seenSirets.add(a.siret);
      seenNames.add(nameKey);

      result.push({
        id: `analyse-${a.analyse_id}`,
        nom: a.nom,
        email: a.email,
        telephone: a.telephone,
        siret: a.siret,
        role: null,
        lotId: a.lot_id,
        lotNom: a.lot_id ? lotMap.get(a.lot_id) ?? null : null,
        source: 'analyse',
        analyseId: a.analyse_id,
        devisId: null,
        dbContact: null,
      });
    }

    return result;
  }, [contacts, analyseArtisans, lotMap]);

  // ── Filtered list ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return unified;
    const q = search.toLowerCase();
    return unified.filter(c =>
      c.nom.toLowerCase().includes(q)
      || c.email?.toLowerCase().includes(q)
      || c.telephone?.includes(q)
      || c.role?.toLowerCase().includes(q)
      || c.lotNom?.toLowerCase().includes(q)
    );
  }, [unified, search]);

  // ── Save (create or update) ───────────────────────────────────────────

  async function handleSave(form: {
    nom: string; email: string; telephone: string; siret: string;
    role: string; lot_id: string; notes: string; contactId?: string;
    source?: string; devis_id?: string; analyse_id?: string;
  }) {
    setSaving(true);
    const isUpdate = !!form.contactId;
    const res = await fetch(`/api/chantier/${chantierId}/contacts`, {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(isUpdate ? { contactId: form.contactId, ...form } : form),
    });
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setEditContact(null);
      fetchContacts();
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────

  async function handleDelete(contactId: string) {
    if (!confirm('Supprimer ce contact ?')) return;
    await fetch(`/api/chantier/${chantierId}/contacts`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId }),
    });
    fetchContacts();
  }

  // ── UI ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-7">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-gray-900">
          Contacts <span className="ml-1.5 text-xs font-normal text-gray-400">{unified.length} contact{unified.length > 1 ? 's' : ''}</span>
        </h2>
        <button
          onClick={() => { setEditContact(null); setShowForm(true); }}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter un contact
        </button>
      </div>

      {/* Search */}
      {unified.length > 3 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input
            type="text" placeholder="Rechercher un contact..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
        </div>
      )}

      {/* Empty state */}
      {unified.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <User className="h-10 w-10 text-gray-200 mx-auto mb-4" />
          <p className="font-bold text-gray-900 mb-1">Aucun contact</p>
          <p className="text-sm text-gray-400 mb-6 max-w-xs leading-relaxed">
            Ajoutez un devis pour importer automatiquement les artisans, ou ajoutez un contact manuellement.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors"
          >
            <Plus className="h-4 w-4" /> Ajouter un contact
          </button>
        </div>
      )}

      {/* Contact cards */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => (
            <ContactCard
              key={c.id}
              contact={c}
              lots={lots}
              chantierId={chantierId}
              token={token}
              onSaved={fetchContacts}
              onEdit={() => { setEditContact(c); setShowForm(true); }}
              onDelete={c.dbContact ? () => handleDelete(c.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <ContactFormModal
          contact={editContact}
          lots={lots}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditContact(null); }}
        />
      )}
    </div>
  );
}

// ── Inline editable field ────────────────────────────────────────────────────

function InlineField({ icon: Icon, value, placeholder, type, onChange }: {
  icon: React.ElementType;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);

  function commit() {
    setEditing(false);
    if (draft.trim() !== value) onChange(draft.trim());
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-blue-400" />
        <input
          autoFocus type={type ?? 'text'} value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          className="flex-1 min-w-0 text-sm border border-blue-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-100"
          placeholder={placeholder}
        />
        <button
          onClick={commit}
          className="p-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0"
          title="Valider"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={cancel}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors shrink-0"
          title="Annuler"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (value) {
    const Tag = type === 'email' ? 'a' : type === 'tel' ? 'a' : 'span';
    const href = type === 'email' ? `mailto:${value}` : type === 'tel' ? `tel:${value}` : undefined;
    return (
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <Tag {...(href ? { href } : {})} className="text-sm text-gray-700 hover:text-blue-600 transition-colors truncate flex-1 min-w-0">
          {value}
        </Tag>
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="text-xs text-gray-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors shrink-0"
        >
          Modifier
        </button>
      </div>
    );
  }

  // Empty — show prominent CTA to fill in
  return (
    <button
      onClick={() => { setDraft(''); setEditing(true); }}
      className="flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-lg border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-300" />
      <span className="text-sm text-gray-400 italic">{placeholder}</span>
      <Plus className="h-3 w-3 text-gray-300 ml-auto" />
    </button>
  );
}

// ── ContactCard ─────────────────────────────────────────────────────────────

function ContactCard({ contact: c, lots, chantierId, token, onSaved, onEdit, onDelete }: {
  contact: UnifiedContact;
  lots: Lot[];
  chantierId: string;
  token: string;
  onSaved: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const sourceBadge = c.source === 'devis' || c.source === 'analyse'
    ? { label: 'Devis', style: 'bg-blue-50 text-blue-600' }
    : c.source === 'facture'
    ? { label: 'Facture', style: 'bg-emerald-50 text-emerald-600' }
    : { label: 'Manuel', style: 'bg-gray-100 text-gray-500' };

  // Quick-save a single field (upsert contact if needed)
  async function quickSave(field: string, value: string) {
    if (c.dbContact) {
      // Update existing
      await fetch(`/api/chantier/${chantierId}/contacts`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: c.id, [field]: value }),
      });
    } else {
      // Create from analyse/devis source
      await fetch(`/api/chantier/${chantierId}/contacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: c.nom, email: c.email, telephone: c.telephone, siret: c.siret,
          role: c.role, lot_id: c.lotId,
          source: c.source === 'analyse' ? 'devis' : c.source,
          analyse_id: c.analyseId,
          devis_id: c.devisId ? (c.devisId.startsWith('devis-') ? c.devisId.slice(6) : c.devisId) : null,
          [field]: value,
        }),
      });
    }
    onSaved();
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-shadow group">
      {/* Header — nom + badge */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-600 shrink-0">
            {c.nom.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">{c.nom}</p>
            {c.siret && <p className="text-[11px] text-gray-400 font-mono">SIRET {c.siret}</p>}
          </div>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${sourceBadge.style}`}>
          {sourceBadge.label}
        </span>
      </div>

      {/* Lot — prominent badge */}
      {c.lotNom ? (
        <div className="flex items-center gap-2 mb-3 px-2.5 py-2 rounded-lg bg-purple-50 border border-purple-100">
          <Layers className="h-3.5 w-3.5 text-purple-500 shrink-0" />
          <span className="text-xs font-semibold text-purple-700 truncate">{c.lotNom}</span>
        </div>
      ) : lots.length > 0 ? (
        <div className="mb-3">
          <select
            value=""
            onChange={e => { if (e.target.value) quickSave('lot_id', e.target.value); }}
            className="w-full text-xs text-gray-400 border border-dashed border-gray-200 rounded-lg px-2.5 py-2 bg-transparent hover:border-purple-300 hover:bg-purple-50/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-100"
          >
            <option value="">+ Rattacher à un intervenant...</option>
            {lots.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
          </select>
        </div>
      ) : null}

      {/* Phone & Email — inline editable, prominent when empty */}
      <div className="space-y-2 mb-3">
        <InlineField
          icon={Phone} type="tel"
          value={c.telephone ?? ''}
          placeholder="+ Ajouter un téléphone"
          onChange={v => quickSave('telephone', v)}
        />
        <InlineField
          icon={Mail} type="email"
          value={c.email ?? ''}
          placeholder="+ Ajouter un email"
          onChange={v => quickSave('email', v)}
        />
      </div>

      {/* Devis link */}
      {c.analyseId && (
        <a
          href={`/analyse/${c.analyseId}`}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 text-[11px] text-blue-500 hover:text-blue-700 mb-2 transition-colors"
        >
          <FileText className="h-3 w-3" /> Voir l'analyse du devis
        </a>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-2 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
          <Pencil className="h-3 w-3" /> Modifier
        </button>
        {onDelete && (
          <button onClick={onDelete} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 className="h-3 w-3" /> Supprimer
          </button>
        )}
      </div>
    </div>
  );
}

// ── ContactFormModal ────────────────────────────────────────────────────────

function ContactFormModal({ contact, lots, saving, onSave, onClose }: {
  contact: UnifiedContact | null;
  lots: Lot[];
  saving: boolean;
  onSave: (form: {
    nom: string; email: string; telephone: string; siret: string;
    role: string; lot_id: string; notes: string; contactId?: string;
    source?: string; devis_id?: string; analyse_id?: string;
  }) => void;
  onClose: () => void;
}) {
  const isEdit = contact?.dbContact;
  const [nom, setNom]             = useState(contact?.nom ?? '');
  const [email, setEmail]         = useState(contact?.email ?? '');
  const [telephone, setTelephone] = useState(contact?.telephone ?? '');
  const [siret, setSiret]         = useState(contact?.siret ?? '');
  const [role, setRole]           = useState(contact?.role ?? '');
  const [lotId, setLotId]         = useState(contact?.lotId ?? '');
  const [notes, setNotes]         = useState(contact?.dbContact?.notes ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      nom, email, telephone, siret, role, lot_id: lotId, notes,
      ...(isEdit ? { contactId: contact!.id } : {}),
      // If creating from a devis-sourced contact, link it
      ...(!isEdit && contact?.devisId ? {
        source: 'devis',
        devis_id: contact.devisId.startsWith('devis-') ? contact.devisId.slice(6) : contact.devisId,
        analyse_id: contact.analyseId ?? undefined,
      } : {}),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{isEdit ? 'Modifier le contact' : 'Nouveau contact'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Nom */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nom / Entreprise *</label>
            <input
              type="text" required value={nom} onChange={e => setNom(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
              placeholder="Ex: Dupont Électricité"
            />
          </div>

          {/* Email + Téléphone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                placeholder="contact@artisan.fr"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
              <input
                type="tel" value={telephone} onChange={e => setTelephone(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>

          {/* SIRET + Rôle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">SIRET</label>
              <input
                type="text" value={siret} onChange={e => setSiret(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                placeholder="12345678901234"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Métier / Rôle</label>
              <input
                type="text" value={role} onChange={e => setRole(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                placeholder="Ex: Électricien, Plombier..."
              />
            </div>
          </div>

          {/* Rattachement lot */}
          {lots.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rattacher à un intervenant (lot)</label>
              <select
                value={lotId} onChange={e => setLotId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white"
              >
                <option value="">— Aucun —</option>
                {lots.map(l => (
                  <option key={l.id} value={l.id}>{l.nom}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none"
              placeholder="Commentaires, disponibilités..."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving || !nom.trim()}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl transition-colors flex items-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
