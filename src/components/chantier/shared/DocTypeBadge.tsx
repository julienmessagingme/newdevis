import { ExternalLink } from 'lucide-react';
import type { DocumentType } from '@/types/chantier-ia';

const CFG: Record<DocumentType, { emoji: string; label: string; bg: string }> = {
  devis:        { emoji: '📄', label: 'Devis',        bg: 'bg-blue-50 text-blue-700' },
  facture:      { emoji: '🧾', label: 'Facture',      bg: 'bg-violet-50 text-violet-700' },
  photo:        { emoji: '📸', label: 'Photo',        bg: 'bg-pink-50 text-pink-700' },
  plan:         { emoji: '📐', label: 'Plan',         bg: 'bg-cyan-50 text-cyan-700' },
  autorisation: { emoji: '🏛️', label: 'Autorisation', bg: 'bg-indigo-50 text-indigo-700' },
  assurance:    { emoji: '🛡️', label: 'Assurance',    bg: 'bg-teal-50 text-teal-700' },
  autre:        { emoji: '📄', label: 'Autre',        bg: 'bg-gray-50 text-gray-700' },
};

interface Props {
  type: DocumentType;
  signedUrl?: string | null;
}

export default function DocTypeBadge({ type, signedUrl }: Props) {
  const c = CFG[type] ?? CFG.autre;
  const inner = (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.bg}`}>
      {c.emoji} {c.label}
      {signedUrl && <ExternalLink className="h-2.5 w-2.5 opacity-60" />}
    </span>
  );

  if (signedUrl) {
    return (
      <a href={signedUrl} target="_blank" rel="noreferrer" className="hover:opacity-80 transition-opacity">
        {inner}
      </a>
    );
  }
  return inner;
}
