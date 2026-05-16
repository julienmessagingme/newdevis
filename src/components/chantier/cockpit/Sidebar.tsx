import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Wallet, Layers, Calendar, FolderOpen, Bot, Settings, Users, Mail, BookOpen, LogOut,
  ChevronUp, Pencil,
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

export interface NavGroup {
  label: string;
  items: { id: Section; label: string; icon: React.ElementType }[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Projet',
    items: [
      { id: 'budget',     label: 'Accueil',             icon: Layers    },
      { id: 'tresorerie', label: 'Budget & Trésorerie', icon: Wallet    },
      { id: 'planning',   label: 'Planning',             icon: Calendar  },
      { id: 'documents',  label: 'Documents',             icon: FolderOpen },
    ],
  },
  {
    label: 'Équipe',
    items: [
      { id: 'contacts',   label: 'Contacts',   icon: Users },
      { id: 'messagerie', label: 'Messagerie', icon: Mail  },
    ],
  },
  {
    label: 'Suivi IA',
    items: [
      { id: 'journal',   label: 'Journal de chantier', icon: BookOpen },
      { id: 'assistant', label: 'Assistant chantier',  icon: Bot      },
    ],
  },
];

// Flat list pour les composants qui en ont besoin (breadcrumbs, etc.)
export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

/** Mark GMC — maison + bras de grue (design system). */
function GmcMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="11" fill="#fff" fillOpacity="0.08" />
      <path d="M11 30 L24 18 L37 30 L37 39 L11 39 Z" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" fill="none" />
      <rect x="21" y="32" width="6" height="7" stroke="#fff" strokeWidth="1.6" fill="none" />
      <line x1="14" y1="12" x2="32" y2="12" stroke="#F58A06" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="12" x2="14" y2="30" stroke="#F58A06" strokeWidth="2" strokeLinecap="round" />
      <rect x="27" y="20" width="4" height="3" fill="#F58A06" />
    </svg>
  );
}

/** Variante visuelle du badge à partir de son texte (alerte / ok / info). */
function badgeClass(text: string): string {
  if (text.includes('✓') || /\bOK\b/i.test(text)) return 'badge ok';
  if (text.includes('⚠')) return 'badge';
  return 'badge gold';
}

export default function Sidebar({ result, activeSection, onSelect, badges, mobileOpen, onCloseMobile, onAmeliorer }: SidebarProps) {
  const [user, setUser] = useState<{ name: string; initials: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const footRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (footRef.current && !footRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      const meta = data.user.user_metadata ?? {};
      const rawName = (meta.full_name || meta.name || data.user.email?.split('@')[0] || 'Mon compte') as string;
      const initials = rawName
        .split(/[\s.@_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(p => p[0]?.toUpperCase() ?? '')
        .join('') || 'JD';
      setUser({ name: rawName, initials });
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onCloseMobile} />
      )}

      <aside className={`
        cr-sidebar
        fixed top-0 left-0 h-full w-[248px] z-40
        pb-[max(0.5rem,env(safe-area-inset-bottom))]
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:z-auto lg:flex-none lg:pb-5
      `}>
        {/* Brand */}
        <div className="cr-sb-brand">
          <div className="cr-sb-brand-mark"><GmcMark /></div>
          <div className="cr-sb-brand-text">
            <div className="l1">Gérer<span className="or">Mon</span>Chantier</div>
            <div className="l2">Pilote IA · cockpit</div>
          </div>
        </div>

        {/* Project picker → tous mes chantiers */}
        <a href="/mon-chantier" className="cr-project-picker">
          <div className="cr-pp-icon">{result.emoji ?? '🏗️'}</div>
          <div className="cr-pp-text">
            <div className="cr-pp-name">{result.nom}</div>
            <div className="cr-pp-sub">Tous mes chantiers</div>
          </div>
          <div className="cr-pp-chev">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </div>
        </a>

        {/* Navigation */}
        <nav className="cr-nav">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="cr-nav-section">
              <div className="cr-nav-label">{group.label}</div>
              {group.items.map(item => {
                const active = activeSection === item.id;
                const badge  = badges[item.id];
                return (
                  <button
                    key={item.id}
                    onClick={() => { onSelect(item.id); onCloseMobile(); }}
                    className={`cr-nav-item${active ? ' active' : ''}`}
                  >
                    <span className="ic"><item.icon /></span>
                    <span className="lbl">{item.label}</span>
                    {badge && <span className={badgeClass(badge.text)}>{badge.text}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer — carte profil seule ; clic → menu (modifier / paramètres / déco) */}
        <div className="cr-sb-foot" ref={footRef}>
          {menuOpen && (
            <div className="cr-sb-menu" role="menu">
              {onAmeliorer && (
                <button
                  type="button" role="menuitem" className="cr-sb-menu-item"
                  onClick={() => { setMenuOpen(false); onAmeliorer(); }}
                >
                  <Pencil />
                  Modifier le projet
                </button>
              )}
              <button
                type="button" role="menuitem" className="cr-sb-menu-item"
                onClick={() => { setMenuOpen(false); onSelect('settings'); onCloseMobile(); }}
              >
                <Settings />
                Paramètres
              </button>
              <button
                type="button" role="menuitem" className="cr-sb-menu-item danger"
                onClick={async () => {
                  setMenuOpen(false);
                  const { signOutCrossDomain } = await import('@/lib/auth/signOut');
                  await signOutCrossDomain('/');
                }}
              >
                <LogOut />
                Déconnexion
              </button>
            </div>
          )}
          <button
            type="button"
            className={`cr-sb-profile${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className="av">{user?.initials ?? 'JD'}</div>
            <div className="who">
              <div className="n">{user?.name ?? 'Mon compte'}</div>
              <div className="r">Pilote du chantier</div>
            </div>
            <ChevronUp className="chev" />
          </button>
        </div>
      </aside>
    </>
  );
}
