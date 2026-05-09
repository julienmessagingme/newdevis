/**
 * Logo adaptatif selon le brand (VMD ou GMC).
 * - VMD : reprend `/images/logo-detoure.webp` + wordmark "VerifierMonDevis.fr"
 * - GMC : SVG inline (mark "maison + grue" sur fond bleu) + wordmark coloré
 *
 * Utilisé dans les pages d'auth partagées (Login, Register).
 */
import type { Brand } from '@/lib/auth/brand';

interface Props {
  brand: Brand;
  size?: 'md' | 'lg';
  /** Couleur du wordmark sur fond sombre. Le mark SVG reste lisible. */
  dark?: boolean;
  className?: string;
}

export default function BrandLogo({ brand, size = 'md', dark = false, className = '' }: Props) {
  const dimensions = size === 'lg' ? { mark: 80, font: 22 } : { mark: 48, font: 18 };

  if (brand === 'gmc') {
    const inkColor = dark ? '#fff' : '#0E1730';
    return (
      <div className={`inline-flex items-center gap-2.5 ${className}`}>
        <svg
          width={dimensions.mark}
          height={dimensions.mark}
          viewBox="0 0 48 48"
          fill="none"
          aria-label="GérerMonChantier"
        >
          <rect x="2" y="2" width="44" height="44" rx="11" fill="#1B3FA1" />
          <g opacity="0.18" stroke="#fff" strokeWidth="0.5">
            <path d="M8 14h32M8 22h32M8 30h32M8 38h32M14 8v32M22 8v32M30 8v32M38 8v32" />
          </g>
          <path
            d="M11 30 L24 18 L37 30 L37 39 L11 39 Z"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
          <rect x="21" y="32" width="6" height="7" stroke="#fff" strokeWidth="1.6" fill="none" />
          <line x1="14" y1="12" x2="32" y2="12" stroke="#F58A06" strokeWidth="2" strokeLinecap="round" />
          <line x1="14" y1="12" x2="14" y2="30" stroke="#F58A06" strokeWidth="2" strokeLinecap="round" />
          <line x1="29" y1="12" x2="29" y2="20" stroke="#fff" strokeWidth="1" strokeDasharray="2 2" />
          <rect x="27" y="20" width="4" height="3" fill="#F58A06" />
        </svg>
        <span
          className="font-bold tracking-tight leading-none"
          style={{ fontSize: dimensions.font, color: inkColor, fontFamily: '"Syne", system-ui, sans-serif' }}
        >
          Gérer<span style={{ color: '#F58A06' }}>Mon</span>Chantier
        </span>
      </div>
    );
  }

  // VMD (default)
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/images/logo-detoure.webp"
        alt="VerifierMonDevis.fr"
        className={size === 'lg' ? 'h-20 w-20 object-contain' : 'h-12 w-12 object-contain'}
      />
      <span className={`text-xl font-bold ${dark ? 'text-white' : 'text-foreground'}`}>
        VerifierMonDevis.fr
      </span>
    </div>
  );
}
