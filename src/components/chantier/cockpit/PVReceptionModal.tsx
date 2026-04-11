/**
 * PVReceptionModal — génère un Procès-Verbal de réception de travaux
 * avec tous les champs obligatoires + export PDF via jsPDF.
 */
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { X, Plus, Trash2, Download, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const _supabase = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL,
  (import.meta as any).env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface Reserve {
  id: string;
  nature: string;
  localisation: string;
  dimensions: string;
  delai: string;
}

interface PVData {
  // Maître d'ouvrage
  mo_nom: string;
  mo_adresse: string;
  // Entrepreneur
  ent_nom: string;
  ent_adresse: string;
  ent_siret: string;
  ent_assurance_nom: string;
  ent_assurance_police: string;
  // Chantier
  chantier_adresse: string;
  nature_travaux: string;
  contrat_ref: string;
  // Dates
  date_visite: string;
  date_reception: string;
  // Réserves
  has_reserves: boolean;
  reserves: Reserve[];
  // Remarques
  remarques: string;
}

interface Props {
  artisanNom: string;
  lotNoms: string[];
  chantierId: string;
  token: string;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newReserve(): Reserve {
  return { id: crypto.randomUUID(), nature: '', localisation: '', dimensions: '', delai: '' };
}

function fmtDate(iso: string): string {
  if (!iso) return '___/___/______';
  return new Date(iso).toLocaleDateString('fr-FR');
}

// ── PDF generation ────────────────────────────────────────────────────────────

async function generatePDF(data: PVData) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const ML = 20;
  const MR = 20;
  const CW = W - ML - MR;
  let y = 20;

  const LINE_H = 6;
  const SECTION_GAP = 8;

  // Helpers
  const line = (text: string, x: number, yy: number, opts?: { bold?: boolean; size?: number; color?: [number,number,number] }) => {
    if (opts?.bold) doc.setFont('helvetica', 'bold'); else doc.setFont('helvetica', 'normal');
    doc.setFontSize(opts?.size ?? 10);
    if (opts?.color) doc.setTextColor(...opts.color); else doc.setTextColor(30, 30, 30);
    doc.text(text, x, yy);
  };

  const hRule = (yy: number, color?: [number,number,number]) => {
    doc.setDrawColor(...(color ?? [180, 180, 180] as [number,number,number]));
    doc.setLineWidth(0.3);
    doc.line(ML, yy, W - MR, yy);
  };

  const sectionTitle = (title: string) => {
    doc.setFillColor(240, 245, 255);
    doc.rect(ML, y - 4, CW, 8, 'F');
    line(title, ML + 2, y + 1, { bold: true, size: 10, color: [30, 50, 120] });
    y += LINE_H + 2;
  };

  const field = (label: string, value: string) => {
    line(`${label} :`, ML, y, { bold: true, size: 9 });
    const wrapped = doc.splitTextToSize(value || '—', CW - 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(wrapped, ML + 38, y);
    y += Math.max(LINE_H, wrapped.length * 5);
  };

  // ── En-tête ──
  doc.setFillColor(30, 50, 120);
  doc.rect(0, 0, W, 22, 'F');
  line('PROCÈS-VERBAL DE RÉCEPTION DE TRAVAUX', ML, 10, { bold: true, size: 14, color: [255,255,255] });
  line('Document légal — à conserver 10 ans', ML, 17, { size: 9, color: [200, 210, 240] });
  y = 32;

  // ── Date ──
  line(`Date de visite : ${fmtDate(data.date_visite)}   ·   Date de réception : ${fmtDate(data.date_reception)}`,
    ML, y, { size: 9, color: [80, 80, 80] });
  y += 8;
  hRule(y - 2);
  y += 4;

  // ── Parties ──
  sectionTitle('1. IDENTITÉ DES PARTIES');
  line('Maître d\'ouvrage', ML + 2, y, { bold: true, size: 9 });
  y += LINE_H;
  field('Nom / Raison sociale', data.mo_nom);
  field('Adresse', data.mo_adresse);
  y += 2;

  line('Entrepreneur', ML + 2, y, { bold: true, size: 9 });
  y += LINE_H;
  field('Nom / Raison sociale', data.ent_nom);
  field('Adresse', data.ent_adresse);
  field('SIRET', data.ent_siret);
  field('Assurance décennale', data.ent_assurance_nom);
  field('N° de police', data.ent_assurance_police);
  y += SECTION_GAP;

  // ── Chantier ──
  sectionTitle('2. DÉSIGNATION DU CHANTIER');
  field('Adresse du chantier', data.chantier_adresse);
  field('Nature des travaux', data.nature_travaux);
  field('Référence contrat/devis', data.contrat_ref);
  y += SECTION_GAP;

  // ── Réserves ──
  sectionTitle('3. RÉSULTAT DE LA RÉCEPTION');

  if (!data.has_reserves) {
    doc.setFillColor(235, 255, 240);
    doc.rect(ML, y - 2, CW, 10, 'F');
    line('✓  Réception prononcée SANS RÉSERVE', ML + 4, y + 5, { bold: true, size: 10, color: [20, 120, 60] });
    y += 14;
  } else {
    doc.setFillColor(255, 245, 230);
    doc.rect(ML, y - 2, CW, 10, 'F');
    line(`⚠  Réception prononcée AVEC ${data.reserves.length} RÉSERVE(S)`, ML + 4, y + 5, { bold: true, size: 10, color: [160, 80, 0] });
    y += 16;

    data.reserves.forEach((r, i) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFillColor(252, 248, 240);
      doc.rect(ML, y - 2, CW, 6, 'F');
      line(`Réserve n°${i + 1}`, ML + 2, y + 2, { bold: true, size: 9, color: [140, 70, 0] });
      y += 8;
      field('Nature du désordre', r.nature);
      field('Localisation', r.localisation);
      if (r.dimensions) field('Dimensions / étendue', r.dimensions);
      field('Délai de levée', r.delai || '—');
      y += 3;
      hRule(y - 1, [220, 210, 190]);
      y += 4;
    });
  }

  if (data.remarques) {
    y += 2;
    sectionTitle('4. REMARQUES');
    const wrapped = doc.splitTextToSize(data.remarques, CW - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(wrapped, ML + 2, y);
    y += wrapped.length * 5 + SECTION_GAP;
  }

  // ── Signatures ──
  if (y > 230) { doc.addPage(); y = 20; }
  y = Math.max(y + 10, 230);
  hRule(y);
  y += 8;
  sectionTitle(data.remarques ? '5. SIGNATURES DES PARTIES' : '4. SIGNATURES DES PARTIES');
  y += 4;

  const col1 = ML;
  const col2 = ML + CW / 2 + 5;

  line('Maître d\'ouvrage', col1, y, { bold: true, size: 9 });
  line('Entrepreneur', col2, y, { bold: true, size: 9 });
  y += 4;
  line(data.mo_nom || '___________________________', col1, y, { size: 9, color: [80, 80, 80] });
  line(data.ent_nom || '___________________________', col2, y, { size: 9, color: [80, 80, 80] });
  y += 18;
  line('Signature :', col1, y, { size: 9 });
  line('Signature :', col2, y, { size: 9 });
  y += 2;
  doc.setDrawColor(160, 160, 160);
  doc.line(col1 + 20, y + 10, col1 + CW / 2 - 5, y + 10);
  doc.line(col2 + 20, y + 10, col2 + CW / 2 - 5, y + 10);
  y += 20;

  // ── Pied de page ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(
      `PV de réception — ${data.ent_nom || 'Entrepreneur'} — Généré via VerifierMonDevis.fr — Page ${p}/${pages}`,
      ML, 290,
    );
  }

  doc.save(`PV-reception-${(data.ent_nom || 'artisan').replace(/\s+/g, '-')}-${data.date_visite || new Date().toISOString().split('T')[0]}.pdf`);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PVReceptionModal({ artisanNom, lotNoms, chantierId, token, onClose }: Props) {
  const today = new Date().toISOString().split('T')[0];

  const [data, setData] = useState<PVData>({
    mo_nom: '',
    mo_adresse: '',
    ent_nom: artisanNom,
    ent_adresse: '',
    ent_siret: '',
    ent_assurance_nom: '',
    ent_assurance_police: '',
    chantier_adresse: '',
    nature_travaux: lotNoms.join(', '),
    contrat_ref: '',
    date_visite: today,
    date_reception: today,
    has_reserves: false,
    reserves: [],
    remarques: '',
  });

  const [prefilling, setPrefilling] = useState(true);
  const [generating, setGenerating] = useState(false);

  // ── Pré-remplissage depuis contacts + session Supabase ────────────────────
  useEffect(() => {
    const prefill = async () => {
      try {
        const { data: { session } } = await _supabase.auth.getSession();
        const bearer = session?.access_token ?? token;

        // Maître d'ouvrage depuis le profil Supabase Auth
        const userMeta = session?.user?.user_metadata;
        const moNom = [userMeta?.first_name, userMeta?.last_name].filter(Boolean).join(' ') || '';

        // Artisan depuis l'API contacts (cherche par nom)
        const contactsRes = await fetch(`/api/chantier/${chantierId}/contacts`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });

        let entAdresse = '';
        let entSiret = '';
        let entAssuranceNom = '';
        let entAssurancePolice = '';
        let chantierAdresse = '';

        if (contactsRes.ok) {
          const { analyseArtisans, contacts } = await contactsRes.json();

          // Cherche l'artisan correspondant au nom (fuzzy — insensible à la casse)
          const artisanLower = artisanNom.toLowerCase();
          const match = [
            ...(analyseArtisans ?? []),
            ...(contacts ?? []),
          ].find((a: any) => (a.nom ?? a.nom_officiel ?? '').toLowerCase().includes(artisanLower)
            || artisanLower.includes((a.nom ?? '').toLowerCase().slice(0, 6)));

          if (match) {
            entAdresse       = match.adresse_siege ?? match.adresse ?? '';
            entSiret         = match.siret ?? '';
            entAssuranceNom  = match.assurance_nom ?? '';
            entAssurancePolice = match.assurance_police ?? '';
          }

          // Adresse chantier depuis les métadonnées chantier
          const chantierRes = await fetch(`/api/chantier/${chantierId}`, {
            headers: { Authorization: `Bearer ${bearer}` },
          });
          if (chantierRes.ok) {
            const ch = await chantierRes.json();
            const meta = ch?.chantier?.metadonnees ?? ch?.metadonnees ?? {};
            chantierAdresse = meta?.adresse ?? meta?.localisation ?? ch?.chantier?.ville ?? '';
          }
        }

        setData(d => ({
          ...d,
          mo_nom:              moNom || d.mo_nom,
          ent_adresse:         entAdresse || d.ent_adresse,
          ent_siret:           entSiret || d.ent_siret,
          ent_assurance_nom:   entAssuranceNom || d.ent_assurance_nom,
          ent_assurance_police: entAssurancePolice || d.ent_assurance_police,
          chantier_adresse:    chantierAdresse || d.chantier_adresse,
        }));
      } catch { /* silencieux — l'utilisateur remplit manuellement */ }
      setPrefilling(false);
    };
    prefill();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (field: keyof PVData, value: unknown) =>
    setData(d => ({ ...d, [field]: value }));

  const setReserve = (id: string, field: keyof Reserve, value: string) =>
    set('reserves', data.reserves.map(r => r.id === id ? { ...r, [field]: value } : r));

  const addReserve = () =>
    set('reserves', [...data.reserves, newReserve()]);

  const removeReserve = (id: string) =>
    set('reserves', data.reserves.filter(r => r.id !== id));

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generatePDF(data);
    } finally {
      setGenerating(false);
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder-gray-300';
  const labelCls = 'block text-[11px] font-semibold text-gray-500 mb-1';

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white z-50 flex flex-col shadow-2xl"
        style={{ animation: 'slideInRight .25s ease' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-indigo-900 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-black text-white">📋 Procès-Verbal de réception</p>
              {prefilling && <Loader2 className="h-3.5 w-3.5 text-indigo-300 animate-spin" />}
            </div>
            <p className="text-[11px] text-indigo-300 mt-0.5">
              {artisanNom}{prefilling ? ' — pré-remplissage…' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Info légale */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[11px] text-amber-800 leading-relaxed">
            <strong>Document légal</strong> — après signature, le PV de réception déclenche le point de départ
            des garanties (parfait achèvement 1 an, biennale 2 ans, décennale 10 ans).
          </div>

          {/* Dates */}
          <section>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-3">Dates</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date de visite de réception *</label>
                <input type="date" className={inputCls} value={data.date_visite}
                  onChange={e => set('date_visite', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Date de réception des travaux *</label>
                <input type="date" className={inputCls} value={data.date_reception}
                  onChange={e => set('date_reception', e.target.value)} />
              </div>
            </div>
          </section>

          {/* Maître d'ouvrage */}
          <section>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-3">Maître d'ouvrage (vous)</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nom / Raison sociale *</label>
                <input type="text" placeholder="Jean Dupont" className={inputCls}
                  value={data.mo_nom} onChange={e => set('mo_nom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Adresse</label>
                <input type="text" placeholder="12 rue des Lilas, 75001 Paris" className={inputCls}
                  value={data.mo_adresse} onChange={e => set('mo_adresse', e.target.value)} />
              </div>
            </div>
          </section>

          {/* Entrepreneur */}
          <section>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-3">Entrepreneur</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Nom / Raison sociale *</label>
                <input type="text" className={inputCls} value={data.ent_nom}
                  onChange={e => set('ent_nom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Adresse</label>
                <input type="text" placeholder="Siège social de l'entreprise" className={inputCls}
                  value={data.ent_adresse} onChange={e => set('ent_adresse', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>SIRET</label>
                <input type="text" placeholder="XXX XXX XXX XXXXX" className={inputCls}
                  value={data.ent_siret} onChange={e => set('ent_siret', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Assurance décennale *</label>
                  <input type="text" placeholder="Nom de l'assureur" className={inputCls}
                    value={data.ent_assurance_nom} onChange={e => set('ent_assurance_nom', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>N° de police *</label>
                  <input type="text" placeholder="N° contrat" className={inputCls}
                    value={data.ent_assurance_police} onChange={e => set('ent_assurance_police', e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          {/* Chantier */}
          <section>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-3">Chantier</p>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Adresse du chantier *</label>
                <input type="text" placeholder="Adresse exacte des travaux" className={inputCls}
                  value={data.chantier_adresse} onChange={e => set('chantier_adresse', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Nature des travaux *</label>
                <input type="text" className={inputCls} value={data.nature_travaux}
                  onChange={e => set('nature_travaux', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Référence contrat / devis signé</label>
                <input type="text" placeholder="Ex : Devis n°2024-047 du 15/03/2024" className={inputCls}
                  value={data.contrat_ref} onChange={e => set('contrat_ref', e.target.value)} />
              </div>
            </div>
          </section>

          {/* Réserves */}
          <section>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-3">Résultat de la réception</p>

            <div className="flex gap-3 mb-4">
              <button
                onClick={() => { set('has_reserves', false); set('reserves', []); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-[12px] font-bold transition-all ${
                  !data.has_reserves
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                }`}>
                <CheckCircle2 className="h-4 w-4" />
                Sans réserve
              </button>
              <button
                onClick={() => set('has_reserves', true)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-[12px] font-bold transition-all ${
                  data.has_reserves
                    ? 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                }`}>
                <AlertCircle className="h-4 w-4" />
                Avec réserve(s)
              </button>
            </div>

            {data.has_reserves && (
              <div className="space-y-4">
                {data.reserves.map((r, i) => (
                  <div key={r.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-black text-amber-800">Réserve n°{i + 1}</span>
                      <button onClick={() => removeReserve(r.id)} className="text-amber-400 hover:text-red-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className={labelCls}>Nature exacte du désordre *</label>
                        <textarea rows={2} placeholder="Ex : Fissure horizontale d'environ 40 cm sur le mur porteur nord..."
                          className={`${inputCls} resize-none`} value={r.nature}
                          onChange={e => setReserve(r.id, 'nature', e.target.value)} />
                      </div>
                      <div>
                        <label className={labelCls}>Localisation précise *</label>
                        <input type="text" placeholder="Ex : Mur nord cuisine, RDC, hauteur appui fenêtre"
                          className={inputCls} value={r.localisation}
                          onChange={e => setReserve(r.id, 'localisation', e.target.value)} />
                      </div>
                      <div>
                        <label className={labelCls}>Dimensions / étendue (si pertinent)</label>
                        <input type="text" placeholder="Ex : 40 cm de long, surface 2 m²"
                          className={inputCls} value={r.dimensions}
                          onChange={e => setReserve(r.id, 'dimensions', e.target.value)} />
                      </div>
                      <div>
                        <label className={labelCls}>Délai de levée de réserve (date butoir) *</label>
                        <input type="date" className={inputCls} value={r.delai}
                          onChange={e => setReserve(r.id, 'delai', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}

                <button onClick={addReserve}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-amber-300 rounded-xl text-[12px] font-bold text-amber-600 hover:bg-amber-50 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Ajouter une réserve
                </button>

                <div className="bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 text-[10px] text-amber-800 leading-relaxed">
                  💡 <strong>Conseil :</strong> Soyez précis dans la description des réserves — mentionnez la nature exacte
                  du désordre, sa localisation et ses dimensions. Préférez une date butoir précise à une durée vague.
                </div>
              </div>
            )}
          </section>

          {/* Remarques */}
          <section>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider mb-3">Remarques libres (optionnel)</p>
            <textarea rows={3} placeholder="Observations complémentaires, conditions particulières..."
              className={`${inputCls} resize-none`} value={data.remarques}
              onChange={e => set('remarques', e.target.value)} />
          </section>

        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-100 bg-gray-50 space-y-2">
          <p className="text-[10px] text-gray-400 text-center">
            Le PDF généré doit être imprimé, signé par les deux parties et conservé 10 ans.
          </p>
          <button onClick={handleGenerate} disabled={generating || !data.mo_nom || !data.ent_nom || !data.chantier_adresse}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-40 text-white text-[13px] font-black rounded-xl transition-colors">
            <Download className="h-4 w-4" />
            {generating ? 'Génération…' : 'Télécharger le PV (PDF)'}
          </button>
          <button onClick={onClose}
            className="w-full py-2 text-[12px] font-semibold text-gray-500 hover:text-gray-700">
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}
