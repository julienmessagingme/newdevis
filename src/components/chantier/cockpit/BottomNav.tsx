/**
 * BottomNav — Barre de navigation tabs en bas pour mobile.
 *
 * Remplace la sidebar slide-from-left sur mobile : navigation 1 tap entre
 * onglets fréquents (Accueil, Budget, Planning, Documents) + bouton "Plus"
 * pour ouvrir un menu vers les onglets moins fréquents (Contacts, Messagerie,
 * Journal, Assistant).
 *
 * S'affiche uniquement sur mobile (lg:hidden). Sur desktop, la sidebar reste.
 */
import { useState } from "react";
import { Layers, Wallet, Calendar, FolderOpen, MoreHorizontal, X, Users, Mail, BookOpen, Bot, Settings } from "lucide-react";
import type { Section, NavBadge } from "./Sidebar";

interface BottomNavProps {
  activeSection: Section;
  onSelect:      (s: Section) => void;
  badges:        Partial<Record<Section, NavBadge>>;
}

const MAIN_TABS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "budget",     label: "Accueil",   icon: Layers     },
  { id: "tresorerie", label: "Budget",    icon: Wallet     },
  { id: "planning",   label: "Planning",  icon: Calendar   },
  { id: "documents",  label: "Documents", icon: FolderOpen },
];

const MORE_TABS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "contacts",   label: "Contacts",   icon: Users    },
  { id: "messagerie", label: "Messagerie", icon: Mail     },
  { id: "journal",    label: "Journal",    icon: BookOpen },
  { id: "assistant",  label: "Assistant",  icon: Bot      },
  { id: "settings",   label: "Paramètres", icon: Settings },
];

export default function BottomNav({ activeSection, onSelect, badges }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const inMore = MORE_TABS.some(t => t.id === activeSection);

  return (
    <>
      {/* Barre fixe en bas */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-5 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {MAIN_TABS.map(tab => {
            const active = activeSection === tab.id;
            const badge  = badges[tab.id];
            const Icon   = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onSelect(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] touch-manipulation ${
                  active ? "text-indigo-600" : "text-gray-500 active:text-gray-800"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className={`text-[10px] ${active ? "font-bold" : "font-medium"}`}>{tab.label}</span>
                {badge && (
                  <span className={`absolute top-1 right-1/2 translate-x-[14px] min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${badge.style}`}>
                    {badge.text}
                  </span>
                )}
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-indigo-600" />
                )}
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] touch-manipulation ${
              inMore ? "text-indigo-600" : "text-gray-500 active:text-gray-800"
            }`}
          >
            <MoreHorizontal className={`h-5 w-5 ${inMore ? "stroke-[2.5]" : ""}`} />
            <span className={`text-[10px] ${inMore ? "font-bold" : "font-medium"}`}>Plus</span>
            {inMore && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-indigo-600" />
            )}
          </button>
        </div>
      </nav>

      {/* Sheet "Plus" — overlay bas avec menu */}
      {moreOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setMoreOpen(false)}
          />
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white z-50 rounded-t-3xl shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-base font-extrabold text-gray-900">Autres sections</h3>
              <button
                onClick={() => setMoreOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
                aria-label="Fermer le menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <ul className="px-3 pb-3">
              {MORE_TABS.map(tab => {
                const active = activeSection === tab.id;
                const badge  = badges[tab.id];
                const Icon   = tab.icon;
                return (
                  <li key={tab.id}>
                    <button
                      onClick={() => { onSelect(tab.id); setMoreOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                        active
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-gray-700 active:bg-gray-50"
                      }`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${active ? "stroke-[2.5]" : ""}`} />
                      <span className={`flex-1 text-sm ${active ? "font-bold" : "font-semibold"}`}>{tab.label}</span>
                      {badge && (
                        <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${badge.style}`}>
                          {badge.text}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
