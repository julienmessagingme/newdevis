/**
 * EspaceArtisanApp — portail mobile de l'Espace Artisan (accès par magic-link, sans compte).
 * Toutes les requêtes portent le header X-Artisan-Token ; l'API valide le token EN LIVE et
 * renvoie uniquement les données cloisonnées de l'artisan (cf. src/lib/api/artisanScope.ts).
 *
 * Charte GérerMonChantier : bleu #1B3FA1, orange #F58A06 (CTA), navy #0E1730 (titres).
 * 3 onglets : Documents (liste + dépôt), Planning (lecture seule, sans montants), Intervenants.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, CalendarDays, Users, Loader2, AlertCircle, CheckCircle2,
  Phone, CloudUpload, Download, ShieldX, MessageSquare, Send, X,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Identity {
  contact: { nom: string | null; role: string | null; lotNom: string | null };
  chantier: { nom: string | null; adresse: string | null };
}
interface ArtisanDoc {
  id: string; nom: string | null; document_type: string | null;
  created_at: string; mime_type: string | null; taille_octets: number | null; signedUrl: string | null;
}
interface PlanningLot {
  id?: string; nom?: string | null; emoji?: string | null; statut?: string | null;
  date_debut?: string | null; date_fin?: string | null;
}
interface PlanningData {
  dateDebutChantier: string | null; dateFinSouhaitee: string | null; lots: PlanningLot[];
}
interface OtherContact { nom: string | null; role: string | null; telephone: string | null; }

type Tab = 'documents' | 'planning' | 'contacts' | 'message';
type LoadState = 'loading' | 'ok' | 'denied' | 'error';

// ── Marque GMC ───────────────────────────────────────────────────────────────

function GmcMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="11" fill="#1B3FA1" />
      <g opacity="0.18" stroke="#fff" strokeWidth="0.5">
        <path d="M8 14h32M8 22h32M8 30h32M8 38h32M14 8v32M22 8v32M30 8v32M38 8v32" />
      </g>
      <path d="M11 30 L24 18 L37 30 L37 39 L11 39 Z" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" fill="none" />
      <rect x="21" y="32" width="6" height="7" stroke="#fff" strokeWidth="1.6" fill="none" />
      <line x1="14" y1="12" x2="32" y2="12" stroke="#F58A06" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="12" x2="14" y2="30" stroke="#F58A06" strokeWidth="2" strokeLinecap="round" />
      <rect x="27" y="20" width="4" height="3" fill="#F58A06" />
    </svg>
  );
}
function GmcWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight text-[#1A2233] ${className}`}>
      Gérer<span className="text-[#F58A06]">Mon</span>Chantier
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const authHeader = (token: string): HeadersInit => ({ 'X-Artisan-Token': token });

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtSize(n: number | null): string {
  if (!n) return '';
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  if (n >= 1024) return `${Math.round(n / 1024)} Ko`;
  return `${n} o`;
}

const DOC_TYPES: Record<string, { label: string; cls: string }> = {
  devis:        { label: 'Devis',        cls: 'bg-[#EEF3FC] text-[#1B3FA1]' },
  facture:      { label: 'Facture',      cls: 'bg-emerald-50 text-emerald-700' },
  photo:        { label: 'Photo',        cls: 'bg-violet-50 text-violet-600' },
  plan:         { label: 'Plan',         cls: 'bg-amber-50 text-amber-700' },
  autorisation: { label: 'Autorisation', cls: 'bg-gray-100 text-gray-600' },
  assurance:    { label: 'Assurance',    cls: 'bg-gray-100 text-gray-600' },
  autre:        { label: 'Document',     cls: 'bg-gray-100 text-gray-500' },
};
const UPLOAD_TYPES: Array<{ value: string; label: string }> = [
  { value: 'photo', label: 'Photo' },
  { value: 'facture', label: 'Facture' },
  { value: 'plan', label: 'Plan' },
  { value: 'autre', label: 'Autre document' },
];

const STATUT_LABELS: Record<string, string> = {
  a_trouver: 'À trouver', a_faire: 'À faire', devis_a_demander: 'Devis à demander',
  devis_recu: 'Devis reçu', artisan_retenu: 'Artisan retenu', contrat_signe: 'Contrat signé',
  en_cours: 'En cours', termine: 'Terminé', bloque: 'Bloqué',
};
function statutInfo(statut: string): { label: string; cls: string } {
  const label = STATUT_LABELS[statut] ?? statut.charAt(0).toUpperCase() + statut.slice(1).replace(/_/g, ' ');
  const cls = statut === 'termine' ? 'bg-emerald-50 text-emerald-700'
    : statut === 'en_cours' ? 'bg-[#EEF3FC] text-[#1B3FA1]'
    : statut === 'bloque' ? 'bg-red-50 text-red-600'
    : 'bg-gray-100 text-gray-500';
  return { label, cls };
}
// Sur le portail artisan : on n'affiche QUE les statuts de progression réels.
// Les statuts de "sourcing" (à trouver, devis à demander/reçu…) sont la cuisine
// interne du cockpit → déroutants pour l'artisan (« mon lot · à trouver »), masqués.
const VISIBLE_STATUTS = new Set(['en_cours', 'termine', 'bloque']);

// ── Root ─────────────────────────────────────────────────────────────────────

export default function EspaceArtisanApp({ token }: { token?: string }) {
  const [state, setState] = useState<LoadState>('loading');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [tab, setTab] = useState<Tab>('documents');
  const [messageContext, setMessageContext] = useState<string | null>(null);

  const openMessage = useCallback((context?: string) => {
    setMessageContext(context ?? null);
    setTab('message');
  }, []);

  useEffect(() => {
    if (!token) { setState('denied'); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/artisan/validate', { headers: authHeader(token) });
        if (!alive) return;
        if (res.status === 403) { setState('denied'); return; }
        if (!res.ok) { setState('error'); return; }
        setIdentity(await res.json());
        setState('ok');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [token]);

  if (state === 'loading') return <Splash><Loader2 className="h-7 w-7 text-[#1B3FA1] animate-spin" /><p className="text-sm text-gray-400 mt-3">Chargement de votre espace…</p></Splash>;
  if (state === 'denied') return <NotAccessible />;
  if (state === 'error') return <Splash><AlertCircle className="h-8 w-8 text-red-400" /><p className="text-sm text-gray-500 mt-3">Une erreur est survenue. Réessayez plus tard.</p></Splash>;

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      <Header identity={identity} />
      <TabBar tab={tab} setTab={setTab} />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {tab === 'documents' && <DocumentsView token={token!} />}
        {tab === 'planning' && <PlanningView token={token!} ownLotNom={identity?.contact.lotNom ?? null} onSignaler={openMessage} />}
        {tab === 'contacts' && <ContactsView token={token!} />}
        {tab === 'message' && <MessageView token={token!} initialContext={messageContext} onContextConsumed={() => setMessageContext(null)} />}
      </main>
    </div>
  );
}

// ── Shells ───────────────────────────────────────────────────────────────────

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}

function NotAccessible() {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center px-6 text-center">
      <div className="mb-8"><GmcWordmark className="text-base" /></div>
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
        <ShieldX className="h-8 w-8 text-gray-400" />
      </div>
      <h1 className="text-lg font-bold text-[#0E1730] mb-2">Cet espace n'est pas accessible</h1>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
        Ce lien n'est plus valide, ou l'accès a été désactivé. Demandez un nouveau lien à la personne
        qui gère le chantier.
      </p>
    </div>
  );
}

function Header({ identity }: { identity: Identity | null }) {
  const c = identity?.contact;
  const ch = identity?.chantier;
  return (
    <header className="bg-white border-b border-gray-100">
      <div className="w-full max-w-2xl mx-auto px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-2">
          <GmcMark size={30} />
          <GmcWordmark className="text-[15px]" />
        </div>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#F58A06]">Espace artisan</p>
        <h1 className="mt-0.5 text-lg font-bold text-[#0E1730] leading-tight truncate">
          {ch?.nom || 'Votre chantier'}
        </h1>
        {ch?.adresse && <p className="text-xs text-gray-400 truncate mt-0.5">{ch.adresse}</p>}
        {(c?.nom || c?.role || c?.lotNom) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            {c?.nom && <span className="font-medium text-gray-600">{c.nom}</span>}
            {c?.role && <span className="text-gray-400">· {c.role}</span>}
            {c?.lotNom && (
              <span className="ml-0.5 inline-flex items-center rounded-full bg-[#FFF4E8] px-2 py-0.5 font-semibold text-[#B25E00]">
                {c.lotNom}
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'planning', label: 'Planning', icon: CalendarDays },
    { id: 'contacts', label: 'Intervenants', icon: Users },
    { id: 'message', label: 'Message', icon: MessageSquare },
  ];
  return (
    <nav className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="w-full max-w-2xl mx-auto px-1 flex">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 border-b-2 transition-colors touch-manipulation ${
              tab === id ? 'border-[#1B3FA1] text-[#1B3FA1]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="text-[11px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ── Documents ────────────────────────────────────────────────────────────────

function DocumentsView({ token }: { token: string }) {
  const [docs, setDocs] = useState<ArtisanDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('photo');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [justAdded, setJustAdded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/artisan/documents', { headers: authHeader(token) });
      if (res.ok) { const d = await res.json(); setDocs(d.documents ?? []); }
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  function pickFile(f: File) {
    setErr('');
    setPending(f);
    setDocName(f.name.replace(/\.[^.]+$/, ''));
    if (/\.(jpe?g|png|webp|heic|gif)$/i.test(f.name)) setDocType('photo');
    else if (f.name.toLowerCase().includes('facture')) setDocType('facture');
    else if (f.name.toLowerCase().includes('plan')) setDocType('plan');
    else setDocType('autre');
  }

  async function doUpload() {
    if (!pending || !docName.trim()) return;
    setUploading(true); setErr('');
    try {
      const urlRes = await fetch('/api/artisan/upload-url', {
        method: 'POST', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: pending.name }),
      });
      if (!urlRes.ok) throw new Error("Impossible de préparer l'envoi.");
      const { signedUrl, bucketPath } = await urlRes.json();

      const put = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': pending.type || 'application/octet-stream' },
        body: pending,
      });
      if (!put.ok) throw new Error("L'envoi du fichier a échoué.");

      const reg = await fetch('/api/artisan/documents', {
        method: 'POST', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: docName.trim(), documentType: docType, bucketPath,
          nomFichier: pending.name, mimeType: pending.type || null, tailleOctets: pending.size || null,
        }),
      });
      if (!reg.ok) { const j = await reg.json().catch(() => ({})); throw new Error(j.error ?? "Enregistrement impossible."); }

      setPending(null); setDocName(''); setUploading(false);
      setJustAdded(true); setTimeout(() => setJustAdded(false), 2500);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur réseau.');
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Dépôt */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <input
          ref={fileRef} type="file" className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx"
          onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }}
        />
        {!pending ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 hover:border-[#1B3FA1]/40 hover:bg-[#F5F7FB] transition-all touch-manipulation"
          >
            <CloudUpload className="h-7 w-7 text-[#1B3FA1]" />
            <span className="text-sm font-semibold text-[#0E1730]">Déposer un document</span>
            <span className="text-xs text-gray-400">Photo, facture, plan… (PDF ou image)</span>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="text-sm font-medium text-emerald-800 truncate flex-1">{pending.name}</span>
              <span className="text-xs text-emerald-600 shrink-0">{fmtSize(pending.size)}</span>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Nom</label>
              <input
                value={docName} onChange={e => setDocName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#DCE6F8] focus:border-[#9DB4E0]"
                placeholder="Nom du document"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Type</label>
              <select
                value={docType} onChange={e => setDocType(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#DCE6F8]"
              >
                {UPLOAD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {err && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setPending(null); setDocName(''); setErr(''); }}
                disabled={uploading}
                className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                onClick={doUpload} disabled={uploading || !docName.trim()}
                className="flex-1 bg-[#F58A06] hover:bg-[#E47C00] disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2 touch-manipulation"
              >
                {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploading ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        )}
        {justAdded && !pending && (
          <p className="mt-3 text-xs text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Document envoyé. Il est transmis au gestionnaire du chantier.
          </p>
        )}
      </div>

      {/* Liste */}
      <div>
        <h2 className="text-sm font-semibold text-[#0E1730] mb-3 px-1">
          Mes documents {!loading && <span className="ml-1 text-xs font-normal text-gray-400">{docs.length}</span>}
        </h2>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 text-gray-300 animate-spin" /></div>
        ) : docs.length === 0 ? (
          <div className="text-center py-10 px-4 bg-white rounded-2xl border border-gray-100">
            <FileText className="h-8 w-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Vous n'avez pas encore déposé de document.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map(d => {
              const t = DOC_TYPES[d.document_type ?? 'autre'] ?? DOC_TYPES.autre;
              return (
                <div key={d.id} className="bg-white rounded-2xl border border-gray-100 p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-gray-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#0E1730] truncate">{d.nom || 'Document'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
                      <span className="text-[11px] text-gray-400">{fmtDate(d.created_at)}</span>
                      {d.taille_octets ? <span className="text-[11px] text-gray-300">{fmtSize(d.taille_octets)}</span> : null}
                    </div>
                  </div>
                  {d.signedUrl && (
                    <a
                      href={d.signedUrl} target="_blank" rel="noopener"
                      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-[#1B3FA1] hover:bg-[#EEF3FC] transition-colors"
                      aria-label="Ouvrir"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Planning ─────────────────────────────────────────────────────────────────

function PlanningView({ token, ownLotNom, onSignaler }: { token: string; ownLotNom: string | null; onSignaler: (lotNom: string) => void }) {
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/artisan/planning', { headers: authHeader(token) });
        if (res.ok) setData(await res.json());
      } finally { setLoading(false); }
    })();
  }, [token]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 text-gray-300 animate-spin" /></div>;

  const lots = data?.lots ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-[#0E1730]">Planning du chantier</h2>
        <span className="text-[11px] text-gray-400">Lecture seule</span>
      </div>
      {lots.length === 0 ? (
        <div className="text-center py-10 px-4 bg-white rounded-2xl border border-gray-100">
          <CalendarDays className="h-8 w-8 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Le planning n'est pas encore défini.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lots.map((lot, i) => {
            const isOwn = !!ownLotNom && lot.nom === ownLotNom;
            const st = lot.statut && VISIBLE_STATUTS.has(lot.statut) ? statutInfo(lot.statut) : null;
            return (
              <div
                key={lot.id ?? i}
                className={`bg-white rounded-2xl border p-3.5 ${isOwn ? 'border-[#1B3FA1]/30 ring-1 ring-[#1B3FA1]/10' : 'border-gray-100'}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg leading-none shrink-0">{lot.emoji || '🔧'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#0E1730] truncate">{lot.nom || 'Lot'}</p>
                      {isOwn && <span className="text-[10px] font-semibold text-[#1B3FA1] bg-[#EEF3FC] px-1.5 py-0.5 rounded-full shrink-0">Vous</span>}
                    </div>
                    {(lot.date_debut || lot.date_fin) && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {fmtDate(lot.date_debut)} → {fmtDate(lot.date_fin)}
                      </p>
                    )}
                  </div>
                  {st && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>}
                </div>
                {isOwn && (
                  <button
                    onClick={() => onSignaler(lot.nom || 'mon lot')}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[#1B3FA1] bg-[#EEF3FC] hover:bg-[#DCE6F8] rounded-xl py-2 transition-colors touch-manipulation"
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Signaler un changement sur mon lot
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Contacts ─────────────────────────────────────────────────────────────────

function ContactsView({ token }: { token: string }) {
  const [contacts, setContacts] = useState<OtherContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/artisan/contacts', { headers: authHeader(token) });
        if (res.ok) { const d = await res.json(); setContacts(d.contacts ?? []); }
      } finally { setLoading(false); }
    })();
  }, [token]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 text-gray-300 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-[#0E1730] px-1">Autres intervenants</h2>
      {contacts.length === 0 ? (
        <div className="text-center py-10 px-4 bg-white rounded-2xl border border-gray-100">
          <Users className="h-8 w-8 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Vous êtes le seul intervenant enregistré pour l'instant.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-3.5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#EEF3FC] flex items-center justify-center text-sm font-bold text-[#1B3FA1] shrink-0">
                {(c.nom || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#0E1730] truncate">{c.nom || 'Intervenant'}</p>
                {c.role && <p className="text-xs text-gray-400 truncate">{c.role}</p>}
              </div>
              {c.telephone && (
                <a
                  href={`tel:${c.telephone}`}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-[#1B3FA1] bg-[#EEF3FC] hover:bg-[#DCE6F8] px-3 py-2 rounded-xl transition-colors touch-manipulation"
                >
                  <Phone className="h-3.5 w-3.5" /> Appeler
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Message ──────────────────────────────────────────────────────────────────

function MessageView({ token, initialContext, onContextConsumed }: {
  token: string;
  initialContext: string | null;
  onContextConsumed: () => void;
}) {
  const [history, setHistory] = useState<Array<{ id: string; body: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [context, setContext] = useState<string | null>(initialContext);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  // Consomme le contexte (« Signaler un changement » sur un lot) une fois au montage.
  useEffect(() => {
    if (initialContext) onContextConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/artisan/message', { headers: authHeader(token) });
      if (res.ok) { const d = await res.json(); setHistory(d.messages ?? []); }
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true); setErr('');
    try {
      const res = await fetch('/api/artisan/message', {
        method: 'POST', headers: { ...authHeader(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), context: context ?? undefined }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? 'Envoi impossible.'); }
      setText(''); setContext(null); setSending(false);
      setSent(true); setTimeout(() => setSent(false), 3000);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur réseau.');
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h2 className="text-sm font-semibold text-[#0E1730]">Un message pour le chantier</h2>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
          Un retard, une question, une date à décaler, une info… Écrivez ici, c'est transmis directement
          au gestionnaire du chantier.
        </p>
        {context && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#EEF3FC] text-[#1B3FA1] text-xs font-semibold pl-2.5 pr-1.5 py-1">
            Concerne : {context}
            <button onClick={() => setContext(null)} className="hover:bg-[#DCE6F8] rounded-full p-0.5" aria-label="Retirer">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <textarea
          value={text} onChange={e => setText(e.target.value)} rows={4}
          placeholder="Votre message…"
          className="mt-3 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#DCE6F8] focus:border-[#9DB4E0]"
        />
        {err && <p className="text-xs text-red-600 flex items-center gap-1.5 mt-1"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{err}</p>}
        <button
          onClick={send} disabled={sending || !text.trim()}
          className="mt-2 w-full bg-[#F58A06] hover:bg-[#E47C00] disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2 touch-manipulation"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? 'Envoi…' : 'Envoyer au chantier'}
        </button>
        {sent && (
          <p className="mt-3 text-xs text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Message transmis au gestionnaire.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[#0E1730] mb-3 px-1">Vos messages</h3>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 text-gray-300 animate-spin" /></div>
        ) : history.length === 0 ? (
          <div className="text-center py-10 px-4 bg-white rounded-2xl border border-gray-100">
            <MessageSquare className="h-8 w-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Aucun message envoyé pour l'instant.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map(m => (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-100 p-3.5">
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{m.body}</p>
                <p className="text-[11px] text-gray-400 mt-1.5">{fmtDate(m.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
