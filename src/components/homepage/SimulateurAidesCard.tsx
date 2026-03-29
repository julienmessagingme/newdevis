import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import AidesTravaux from '@/components/chantier/cockpit/financing/AidesTravaux';

const ADMIN_EMAILS = ['julien@messagingme.fr', 'bridey.johan@gmail.com'];

function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.includes('auth-token'));
      for (const key of keys) {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        if (data?.user?.email && ADMIN_EMAILS.includes(data.user.email)) {
          setIsAdmin(true);
          break;
        }
      }
    } catch {}
  }, []);
  return isAdmin;
}

export default function SimulateurAidesCard() {
  const [open, setOpen] = useState(false);
  const isAdmin = useIsAdmin();

  return (
    <>
      {/* ── Carte ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex flex-col border-2 border-emerald-200 rounded-2xl p-7 sm:p-8 hover:border-emerald-400 hover:shadow-xl transition-all bg-white w-full text-left"
      >
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-5 flex-shrink-0 group-hover:scale-110 transition-transform">
          <svg className="h-7 w-7 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-lg font-bold text-slate-900 mb-2 leading-snug">
          Calculer mes aides financières
        </p>
        <p className="text-sm text-slate-500 leading-relaxed flex-1">
          Estimez vos droits à MaPrimeRénov', CEE et Éco-PTZ selon votre profil en 1 minute.
        </p>
        <span className="mt-6 inline-flex items-center justify-center gap-2 bg-emerald-600 group-hover:bg-emerald-700 text-white font-semibold px-5 py-3 rounded-xl transition-colors">
          Calculer mes aides
          <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </span>
      </button>

      {/* ── Modale ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <p className="font-bold text-gray-900 text-sm">Calculer mes aides travaux</p>
                <p className="text-[11px] text-gray-400 mt-0.5">MaPrimeRénov' · CEE · Éco-PTZ</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Contenu */}
            <div className="p-5">
              <AidesTravaux
                {...(isAdmin ? {
                  onImportAides: () => {
                    setOpen(false);
                    window.location.href = '/mon-chantier/nouveau';
                  }
                } : {})}
                standalone
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
