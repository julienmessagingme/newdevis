/**
 * ContactsSection — Carnet de contacts du chantier.
 * Affiche les artisans des devis/factures + contacts manuels.
 * Permet d'ajouter, modifier, rattacher à un lot.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Phone, Mail, ExternalLink, Building2, X, Loader2,
  Pencil, Trash2, Link2, User, Search, FileText,
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

interface DevisArtisan {
  id: string;
  artisan_nom: string;
  artisan_email: string | null;
  artisan_phone: string | null;
  artisan_siret: string | null;
  lot_id: string | null;
  type_travaux: string;
  analyse_id: string | null;
}

interface AnalyseArtisan {
  analyse_id: string;
  nom: string;
  nom_officiel: string | null;
  siret: string | null;
  email: string | null;
  telephone: string | null;
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
  const [devisArtisans, setDevisArtisans]     = useState<DevisArtisan[]>([]);
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
    setDevisArtisans(data.devisArtisans ?? []);
    setAnalyseArtisans(data.analyseArtisans ?? []);
    setLots(data.lots ?? []);
    setLoading(false);
  }, [chantierId, token]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // ── Build unified list ────────────────────────────────────────────────

  const lotMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lots) m.set(l.id, l.nom);
    return m;
  }, [lots]);

  const unified = useMemo(() => {
    const result: UnifiedContact[] = [];
    const seenSirets = new Set<string>();
    const seenNames  = new Set<string>();

    // 1) Contacts from DB (manual or previously saved)
    for (const c of contacts) {
      if (c.siret) seenSirets.add(c.siret);
      seenNames.add(c.nom.toLowerCase());
      result.push({
        id: c.id,
        nom: c.nom,
        email: c.email,
        telephone: c.telephone,
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

    // 2) Artisans from analyses (primary source — real company names + SIRET)
    for (const a of analyseArtisans) {
      // Deduplicate by SIRET first, then by name
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
        lotId: null,
        lotNom: null,
        source: 'analyse',
        analyseId: a.analyse_id,
        devisId: null,
        dbContact: null,
      });
    }

    // 3) Artisans from devis_chantier (fallback — only if not already seen)
    for (const d of devisArtisans) {
      if (d.artisan_siret && seenSirets.has(d.artisan_siret)) continue;
      const nameKey = d.artisan_nom.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      if (d.artisan_siret) seenSirets.add(d.artisan_siret);
      seenNames.add(nameKey);

      result.push({
        id: `devis-${d.id}`,
        nom: d.artisan_nom,
        email: d.artisan_email,
        telephone: d.artisan_phone,
        siret: d.artisan_siret,
        role: d.type_travaux || null,
        lotId: d.lot_id,
        lotNom: d.lot_id ? lotMap.get(d.lot_id) ?? null : null,
        source: 'devis',
        analyseId: d.analyse_id,
        devisId: d.id,
        dbContact: null,
      });
    }

    return result;
  }, [contacts, devisArtisans, analyseArtisans, lotMap]);

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

// ── ContactCard ─────────────────────────────────────────────────────────────

function ContactCard({ contact: c, onEdit, onDelete }: {
  contact: UnifiedContact;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const sourceBadge = c.source === 'devis' || c.source === 'analyse'
    ? { label: 'Devis', style: 'bg-blue-50 text-blue-600' }
    : c.source === 'facture'
    ? { label: 'Facture', style: 'bg-emerald-50 text-emerald-600' }
    : { label: 'Manuel', style: 'bg-gray-100 text-gray-500' };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-sm transition-shadow group">
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
            {c.nom.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">{c.nom}</p>
            {c.role && <p className="text-xs text-gray-400 truncate">{c.role}</p>}
          </div>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${sourceBadge.style}`}>
          {sourceBadge.label}
        </span>
      </div>

      {/* Contact info */}
      <div className="space-y-1.5 mb-3">
        {c.email && (
          <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-600 transition-colors truncate">
            <Mail className="h-3 w-3 shrink-0 text-gray-300" /> {c.email}
          </a>
        )}
        {c.telephone && (
          <a href={`tel:${c.telephone}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-600 transition-colors">
            <Phone className="h-3 w-3 shrink-0 text-gray-300" /> {c.telephone}
          </a>
        )}
        {c.siret && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Building2 className="h-3 w-3 shrink-0 text-gray-300" /> SIRET {c.siret}
          </div>
        )}
        {!c.email && !c.telephone && (
          <p className="text-xs text-gray-300 italic">Aucune info de contact</p>
        )}
      </div>

      {/* Lot link */}
      {c.lotNom && (
        <div className="flex items-center gap-1.5 mb-3">
          <Link2 className="h-3 w-3 text-gray-300" />
          <span className="text-[11px] text-gray-400">Rattaché à <span className="font-medium text-gray-600">{c.lotNom}</span></span>
        </div>
      )}

      {/* Devis link */}
      {c.analyseId && (
        <a
          href={`/analyse/${c.analyseId}`}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 text-[11px] text-blue-500 hover:text-blue-700 mb-3 transition-colors"
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
