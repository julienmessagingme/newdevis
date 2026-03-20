import { useState } from 'react';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { FollowUpQuestion } from '@/types/chantier-ia';

interface ScreenQualificationProps {
  questions: FollowUpQuestion[];
  description: string;
  onSubmit: (answers: Record<string, string>) => void;
  onBack: () => void;
}

interface PhotoCard {
  value: string;
  label: string;
  price: string;
  photo: string; // URL Unsplash
}

interface PhotoSection {
  id: string;
  title: string;
  cols: 2 | 3;
  cards: PhotoCard[];
}

const SECTIONS: PhotoSection[] = [
  {
    id: '_type_piscine',
    title: 'Type de piscine',
    cols: 3,
    cards: [
      {
        value: 'hors-sol',
        label: 'Hors-sol',
        price: '~10 000€',
        photo: 'https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=600&q=80&fit=crop',
      },
      {
        value: 'semi-enterree',
        label: 'Semi-enterrée',
        price: '~20 000€',
        photo: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80&fit=crop',
      },
      {
        value: 'enterree',
        label: 'Enterrée',
        price: '~35 000€',
        photo: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=600&q=80&fit=crop',
      },
    ],
  },
  {
    id: '_type_terrasse',
    title: 'Type de terrasse',
    cols: 3,
    cards: [
      {
        value: 'classique',
        label: 'Classique',
        price: '~3 000€',
        photo: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=600&q=80&fit=crop',
      },
      {
        value: 'confort',
        label: 'Confort',
        price: '~6 000€',
        photo: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=600&q=80&fit=crop',
      },
      {
        value: 'premium',
        label: 'Premium',
        price: '~12 000€',
        photo: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80&fit=crop',
      },
    ],
  },
  {
    id: '_style_global',
    title: 'Style du projet',
    cols: 3,
    cards: [
      {
        value: 'fonctionnel',
        label: 'Fonctionnel',
        price: "L'essentiel",
        photo: 'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=600&q=80&fit=crop',
      },
      {
        value: 'confort',
        label: 'Confort',
        price: 'Rapport qualité/prix',
        photo: 'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=600&q=80&fit=crop',
      },
      {
        value: 'luxe',
        label: 'Luxe',
        price: 'Haut de gamme',
        photo: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=600&q=80&fit=crop',
      },
    ],
  },
  {
    id: '_implication',
    title: 'Votre implication',
    cols: 2,
    cards: [
      {
        value: 'delegation',
        label: 'Je délègue tout',
        price: 'Suivi simple · Coordination artisans',
        photo: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80&fit=crop',
      },
      {
        value: 'partiel',
        label: 'Je fais une partie moi-même',
        price: 'Économies · Matériaux · Conseils personnalisés',
        photo: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&q=80&fit=crop',
      },
    ],
  },
];

function SelectionRing() {
  return (
    <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg">
      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 12 12">
        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function ScreenQualification({
  description,
  onSubmit,
  onBack,
}: ScreenQualificationProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});

  const select = (sectionId: string, value: string) =>
    setSelections((prev) => ({ ...prev, [sectionId]: value }));

  const allSelected = SECTIONS.every((s) => !!selections[s.id]);

  const descriptionPreview =
    description.length > 70 ? description.slice(0, 70) + '…' : description;

  return (
    <div className="min-h-screen bg-[#080d1a] flex flex-col items-center px-4 py-14">
      {/* Header */}
      <div className="w-full max-w-2xl text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
          Affinez votre projet
        </h1>
        <p className="text-slate-400 text-base mb-5">
          Choisissez les options qui vous correspondent
        </p>
        {description && (
          <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-4 py-2 text-xs text-slate-500 max-w-sm">
            <span className="shrink-0">💬</span>
            <span className="truncate">{descriptionPreview}</span>
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="w-full max-w-2xl space-y-10 pb-32">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            <h2 className="text-white font-semibold text-xs uppercase tracking-widest mb-4 opacity-40">
              {section.title}
            </h2>
            <div className={`grid gap-3 ${section.cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {section.cards.map((card) => {
                const selected = selections[section.id] === card.value;
                return (
                  <button
                    key={card.value}
                    onClick={() => select(section.id, card.value)}
                    className={`
                      relative overflow-hidden rounded-2xl text-left group
                      transition-all duration-200
                      ${selected
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-[#080d1a]'
                        : 'ring-1 ring-white/[0.08] hover:ring-white/20'
                      }
                    `}
                  >
                    {/* Photo */}
                    <div className={`overflow-hidden ${section.cols === 2 ? 'h-40' : 'h-32'}`}>
                      <img
                        src={card.photo}
                        alt={card.label}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>

                    {/* Overlay + text */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 px-3.5 py-3">
                      <p className="text-white font-semibold text-sm leading-tight">{card.label}</p>
                      <p className={`text-xs mt-0.5 ${selected ? 'text-blue-300' : 'text-white/50'}`}>
                        {card.price}
                      </p>
                    </div>

                    {/* Selection check */}
                    {selected && <SelectionRing />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 pointer-events-none">
        <div className="bg-gradient-to-t from-[#080d1a] via-[#080d1a]/95 to-transparent pt-8 pb-6 px-4 pointer-events-auto">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => allSelected && onSubmit(selections)}
              disabled={!allSelected}
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-25 disabled:cursor-not-allowed text-slate-900 font-semibold rounded-xl py-3.5 text-sm transition-all duration-150"
            >
              Continuer
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={onBack}
              className="w-full flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs mt-3 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Modifier ma description
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
