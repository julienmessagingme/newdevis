import React from 'react';
import {
  ArrowLeft, Pencil, Wallet, Layers,
  FileSearch, Calendar, FolderOpen, Bot, Settings, Users, Mail, BookOpen,
} from 'lucide-react';
import type { ChantierIAResult } from '@/types/chantier-ia';

export type Section = 'budget' | 'lots' | 'contacts' | 'messagerie' | 'analyse' | 'planning' | 'documents' | 'journal' | 'assistant' | 'diy' | 'settings' | 'tresorerie';

export interface NavBadge { text: string; style: string }

interface SidebarProps {
  result: ChantierIAResult;
  activeSection: Section;
  onSelect: (s: Section) => void;
  rangeMin: number;
  rangeMax: number;
  badges: Partial<Record<Section, NavBadge>>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onAmeliorer?: () => void;
}

export const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'budget',     label: 'Vue d\'ensemble',     icon: Layers      },
  { id: 'tresorerie', label: 'Budget & Trésorerie', icon: Wallet      },
  { id: 'contacts',   label: 'Contacts',            icon: Users       },
  { id: 'messagerie', label: 'Messagerie',          icon: Mail        },
  { id: 'analyse',    label: 'Analyse des devis',   icon: FileSearch  },
  { id: 'planning',   label: 'Planning',             icon: Calendar    },
  { id: 'documents',  label: 'Documents',            icon: FolderOpen  },
  { id: 'journal',    label: 'Journal de chantier', icon: BookOpen    },
  { id: 'assistant',  label: 'Assistant chantier',  icon: Bot         },
];

export default function Sidebar({ result, activeSection, onSelect, rangeMin, rangeMax, badges, mobileOpen, onCloseMobile, onAmeliorer }: SidebarProps) {
  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={onCloseMobile} />
      )}

      <aside className={`
        fixed top-0 left-0 h-full w-[240px] bg-white border-r border-gray-100 z-40 flex flex-col
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:z-auto lg:flex-none
      `}>
        {/* Projet — logo seul, pas de doublon nom/budget */}
        <div className="px-4 py-4 border-b border-gray-50">
          <a href="/mon-chantier"
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-3 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Mes chantiers
          </a>
          <button
            onClick={() => { onSelect('budget'); onCloseMobile(); }}
            className="flex items-center gap-2.5 w-full text-left hover:opacity-80 transition-opacity"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-lg shrink-0">
              {result.emoji}
            </div>
            <span className="text-xs text-gray-400 truncate">Vue d'ensemble</span>
          </button>
          {onAmeliorer && (
            <button
              onClick={onAmeliorer}
              className="mt-2.5 w-full flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl px-3 py-2 transition-all"
            >
              <Pencil className="h-3 w-3 shrink-0" />
              Modifier le projet
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider px-2 mb-2">Navigation</p>
          {NAV_ITEMS.map(item => {
            const active = activeSection === item.id;
            const badge  = badges[item.id];
            return (
              <button key={item.id}
                onClick={() => { onSelect(item.id); onCloseMobile(); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-0.5 transition-all text-left group ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}>
                <item.icon className={`h-4 w-4 shrink-0 transition-colors ${active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                <span className="flex-1 truncate">{item.label}</span>
                {badge && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.style}`}>
                    {badge.text}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Paramètres (bas) */}
        <div className="px-3 pb-4 pt-3 border-t border-gray-50">
          <button
            onClick={() => { onSelect('settings'); onCloseMobile(); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeSection === 'settings' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}>
            <Settings className={`h-4 w-4 ${activeSection === 'settings' ? 'text-blue-600' : 'text-gray-400'}`} />
            Paramètres
          </button>
        </div>
      </aside>
    </>
  );
}
