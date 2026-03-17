// ============================================================
// MATERIAL_IMAGES.tsx
// Solution définitive aux images 404 :
// 1. SVG placeholders premium générés côté client (jamais de 404)
// 2. Tentative URL Unsplash en premier (si dispo = beau visuel)
// 3. Fallback SVG automatique si 404
// ============================================================

import { useState } from "react";

// ─── PHOTO EXPERT CHANTIER ───────────────────────────────────
// URL validée manuellement — homme souriant casque jaune
export const EXPERT_PHOTO_URL =
  "https://images.pexels.com/photos/1516680/pexels-photo-1516680.jpeg?auto=compress&cs=tinysrgb&w=200";

// ─── COMPOSANT AVATAR EXPERT ─────────────────────────────────

export function ExpertAvatar({
  size = 32,
  showBadge = true,
  className = "",
}: {
  size?: number;
  showBadge?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {!failed ? (
        <img
          src={EXPERT_PHOTO_URL}
          alt="Expert chantier"
          style={{ width: size, height: size }}
          className="rounded-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      ) : (
        // Fallback SVG si la photo ne charge pas
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          className="rounded-full"
        >
          <circle cx="20" cy="20" r="20" fill="#1e3a5f" />
          <ellipse cx="20" cy="16" rx="7" ry="8" fill="#fbbf24" />
          <rect x="8" y="4" width="24" height="10" rx="3" fill="#f59e0b" />
          <rect x="6" y="12" width="28" height="5" rx="2" fill="#d97706" />
          <ellipse cx="20" cy="36" rx="12" ry="8" fill="#1d4ed8" />
        </svg>
      )}
      {showBadge && (
        <span
          className="absolute -bottom-0.5 -right-0.5 block rounded-full bg-green-400 border-2 border-slate-900"
          style={{ width: size * 0.3, height: size * 0.3 }}
        />
      )}
    </div>
  );
}

// ─── BOUTON ASSISTANT CHANTIER ENRICHI ───────────────────────

export function AssistantChantierContent() {
  return (
    <div className="flex items-center gap-2">
      <ExpertAvatar size={28} showBadge={true} />
      <span>Assistant chantier</span>
    </div>
  );
}

// ─── SIDEBAR EXPERT BLOCK ────────────────────────────────────

export function ExpertSidebarBlock() {
  return (
    <div className="flex items-center gap-3 mb-3 p-2.5 bg-slate-800/40 rounded-xl border border-slate-700/40">
      <ExpertAvatar size={40} showBadge={true} />
      <div>
        <p className="text-xs font-semibold text-white leading-tight">
          Votre expert chantier
        </p>
        <p className="text-[10px] text-green-400 mt-0.5">
          ● Disponible
        </p>
      </div>
    </div>
  );
}

// ─── DONNÉES IMAGES PAR MATÉRIAU ─────────────────────────────

interface MaterialImageConfig {
  url: string;
  svgBg1: string;
  svgBg2: string;
  emoji: string;
  label: string;
}

export const MATERIAL_IMAGES: Record<string, MaterialImageConfig> = {

  // ── ALLÉE / SOL EXTÉRIEUR ──
  "gravier": {
    url: "https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=800&q=80&fit=crop",
    svgBg1: "#78716c", svgBg2: "#44403c", emoji: "🪨", label: "Gravier"
  },
  "paves": {
    url: "https://images.unsplash.com/photo-1590682680695-43b964a3ae17?w=800&q=80&fit=crop",
    svgBg1: "#7c3aed", svgBg2: "#4c1d95", emoji: "🧱", label: "Pavés"
  },
  "enrobe": {
    url: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=800&q=80&fit=crop",
    svgBg1: "#1c1917", svgBg2: "#0c0a09", emoji: "⬛", label: "Enrobé"
  },

  // ── TERRASSE BOIS ──
  "pin-traite": {
    url: "https://images.unsplash.com/photo-1600607687939-d6a6d04671d9?w=800&q=80&fit=crop",
    svgBg1: "#92400e", svgBg2: "#78350f", emoji: "🪵", label: "Pin traité"
  },
  "composite": {
    url: "https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=800&q=80&fit=crop",
    svgBg1: "#374151", svgBg2: "#1f2937", emoji: "🪵", label: "Composite"
  },
  "bois-exotique": {
    url: "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800&q=80&fit=crop",
    svgBg1: "#7c2d12", svgBg2: "#431407", emoji: "🌴", label: "Bois exotique"
  },

  // ── PISCINE ──
  "piscine-coque": {
    url: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80&fit=crop",
    svgBg1: "#0284c7", svgBg2: "#0c4a6e", emoji: "🏊", label: "Piscine coque"
  },
  "piscine-macon": {
    url: "https://images.unsplash.com/photo-1575429198097-0414ec08e8cd?w=800&q=80&fit=crop",
    svgBg1: "#0369a1", svgBg2: "#082f49", emoji: "🏗️", label: "Piscine béton"
  },
  "piscine-liner": {
    url: "https://images.unsplash.com/photo-1530053969600-caed2596d242?w=800&q=80&fit=crop",
    svgBg1: "#0891b2", svgBg2: "#164e63", emoji: "💧", label: "Piscine liner"
  },
  "piscine-bois": {
    url: "https://images.unsplash.com/photo-1530053969600-caed2596d242?w=800&q=80&fit=crop",
    svgBg1: "#92400e", svgBg2: "#78350f", emoji: "🪵", label: "Piscine bois"
  },

  // ── TOITURE ──
  "tuile-terre-cuite": {
    url: "https://images.unsplash.com/photo-1558979396-dd9f634cd28f?w=800&q=80&fit=crop",
    svgBg1: "#b45309", svgBg2: "#92400e", emoji: "🏠", label: "Tuile terre cuite"
  },
  "toiture-ardoise": {
    url: "https://images.unsplash.com/photo-1480497490787-505ec2618b21?w=800&q=80&fit=crop",
    svgBg1: "#334155", svgBg2: "#0f172a", emoji: "🏚️", label: "Ardoise"
  },
  "ardoise": {
    url: "https://images.unsplash.com/photo-1480497490787-505ec2618b21?w=800&q=80&fit=crop",
    svgBg1: "#334155", svgBg2: "#0f172a", emoji: "🏚️", label: "Ardoise"
  },
  "toiture-zinc": {
    url: "https://images.unsplash.com/photo-1516455590571-18373a7d0e8a?w=800&q=80&fit=crop",
    svgBg1: "#374151", svgBg2: "#111827", emoji: "🏭", label: "Zinc / Bac acier"
  },
  "bac-acier": {
    url: "https://images.unsplash.com/photo-1516455590571-18373a7d0e8a?w=800&q=80&fit=crop",
    svgBg1: "#374151", svgBg2: "#111827", emoji: "🏭", label: "Zinc / Bac acier"
  },

  // ── SOL INTÉRIEUR ──
  "parquet-chene": {
    url: "https://images.unsplash.com/photo-1581539250439-c96689b516dd?w=800&q=80&fit=crop",
    svgBg1: "#92400e", svgBg2: "#78350f", emoji: "🪵", label: "Parquet chêne"
  },
  "stratifie": {
    url: "https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=800&q=80&fit=crop",
    svgBg1: "#d6d3d1", svgBg2: "#a8a29e", emoji: "▦", label: "Stratifié"
  },
  "beton-cire-sol": {
    url: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800&q=80&fit=crop",
    svgBg1: "#6b7280", svgBg2: "#374151", emoji: "⬜", label: "Béton ciré"
  },

  // ── CARRELAGE ──
  "ceramique": {
    url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&q=80&fit=crop",
    svgBg1: "#e7e5e4", svgBg2: "#d6d3d1", emoji: "▦", label: "Céramique"
  },
  "gres-cerame": {
    url: "https://images.unsplash.com/photo-1615971677499-5467cbab01c0?w=800&q=80&fit=crop",
    svgBg1: "#78716c", svgBg2: "#57534e", emoji: "⬛", label: "Grès cérame"
  },
  "marbre": {
    url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80&fit=crop",
    svgBg1: "#f5f5f4", svgBg2: "#e7e5e4", emoji: "💎", label: "Marbre"
  },

  // ── MUR SDB ──
  "faience-metro": {
    url: "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800&q=80&fit=crop",
    svgBg1: "#f8fafc", svgBg2: "#e2e8f0", emoji: "🔲", label: "Faïence métro"
  },
  "beton-cire-mur": {
    url: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80&fit=crop",
    svgBg1: "#6b7280", svgBg2: "#4b5563", emoji: "🪨", label: "Béton ciré mur"
  },
  "tadelakt": {
    url: "https://images.unsplash.com/photo-1600607686527-6fb886090705?w=800&q=80&fit=crop",
    svgBg1: "#d4b483", svgBg2: "#a37c5b", emoji: "🟤", label: "Tadelakt"
  },

  // ── MURS INTÉRIEURS ──
  "peinture": {
    url: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80&fit=crop",
    svgBg1: "#818cf8", svgBg2: "#4338ca", emoji: "🎨", label: "Peinture"
  },
  "papier-peint": {
    url: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&q=80&fit=crop",
    svgBg1: "#fde68a", svgBg2: "#f59e0b", emoji: "🖼️", label: "Papier peint"
  },
  "lambris-bois": {
    url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80&fit=crop",
    svgBg1: "#92400e", svgBg2: "#78350f", emoji: "🪵", label: "Lambris bois"
  },

  // ── MAÇONNERIE ──
  "parpaing": {
    url: "https://images.unsplash.com/photo-1565793979038-0fabd39e7c97?w=800&q=80&fit=crop",
    svgBg1: "#9ca3af", svgBg2: "#6b7280", emoji: "🧱", label: "Parpaing"
  },
  "brique-rouge": {
    url: "https://images.unsplash.com/photo-1523217582562-09d05ab4e479?w=800&q=80&fit=crop",
    svgBg1: "#dc2626", svgBg2: "#991b1b", emoji: "🧱", label: "Brique rouge"
  },
  "brique-monomur": {
    url: "https://images.unsplash.com/photo-1598928636135-d146006ff4be?w=800&q=80&fit=crop",
    svgBg1: "#ea580c", svgBg2: "#c2410c", emoji: "🧱", label: "Monomur"
  },

  // ── ISOLATION ──
  "laine-verre": {
    url: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80&fit=crop",
    svgBg1: "#fbbf24", svgBg2: "#d97706", emoji: "🟡", label: "Laine de verre"
  },
  "ouate-cellulose": {
    url: "https://images.unsplash.com/photo-1601584116435-c05538ff1fe4?w=800&q=80&fit=crop",
    svgBg1: "#65a30d", svgBg2: "#3f6212", emoji: "🌿", label: "Ouate cellulose"
  },
  "laine-roche": {
    url: "https://images.unsplash.com/photo-1566662533428-d9e74c9d7f05?w=800&q=80&fit=crop",
    svgBg1: "#6b7280", svgBg2: "#374151", emoji: "⬜", label: "Laine de roche"
  },

  // ── FAÇADE ──
  "enduit-monocouche": {
    url: "https://images.unsplash.com/photo-1628744448840-55bdb2497bd4?w=800&q=80&fit=crop",
    svgBg1: "#f5f0e8", svgBg2: "#e8dcc8", emoji: "🏠", label: "Enduit monocouche"
  },
  "enduit-chaux": {
    url: "https://images.unsplash.com/photo-1523217582562-09d05ab4e479?w=800&q=80&fit=crop",
    svgBg1: "#fef3c7", svgBg2: "#fde68a", emoji: "🟡", label: "Enduit chaux"
  },
  "ITE": {
    url: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&q=80&fit=crop",
    svgBg1: "#10b981", svgBg2: "#065f46", emoji: "🏠", label: "ITE"
  },

  // ── MENUISERIES ──
  "fenetre-pvc": {
    url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&fit=crop",
    svgBg1: "#f1f5f9", svgBg2: "#cbd5e1", emoji: "🪟", label: "Fenêtre PVC"
  },
  "fenetre-alu": {
    url: "https://images.unsplash.com/photo-1600566752799-62a1acf62e53?w=800&q=80&fit=crop",
    svgBg1: "#94a3b8", svgBg2: "#475569", emoji: "🪟", label: "Fenêtre alu"
  },
  "fenetre-bois": {
    url: "https://images.unsplash.com/photo-1600566752231-8c7cd6fac1a7?w=800&q=80&fit=crop",
    svgBg1: "#92400e", svgBg2: "#78350f", emoji: "🪟", label: "Fenêtre bois"
  },

  // ── PORTAIL ──
  "portail-aluminium": {
    url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80&fit=crop",
    svgBg1: "#6b7280", svgBg2: "#374151", emoji: "🚪", label: "Portail alu"
  },
  "portail-fer-forge": {
    url: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&q=80&fit=crop",
    svgBg1: "#1c1917", svgBg2: "#0c0a09", emoji: "🔩", label: "Fer forgé"
  },
  "portail-bois": {
    url: "https://images.unsplash.com/photo-1600607687939-d6a6d04671d9?w=800&q=80&fit=crop",
    svgBg1: "#92400e", svgBg2: "#451a03", emoji: "🚪", label: "Portail bois"
  },
  "portail-pvc": {
    url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80&fit=crop",
    svgBg1: "#f1f5f9", svgBg2: "#cbd5e1", emoji: "🚪", label: "Portail PVC"
  },

  // ── PERGOLA ──
  "pergola-bois": {
    url: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80&fit=crop",
    svgBg1: "#92400e", svgBg2: "#78350f", emoji: "🏡", label: "Pergola bois"
  },
  "pergola-alu": {
    url: "https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=800&q=80&fit=crop",
    svgBg1: "#64748b", svgBg2: "#334155", emoji: "🏡", label: "Pergola alu"
  },
  "pergola-bioclimatique": {
    url: "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800&q=80&fit=crop",
    svgBg1: "#0f766e", svgBg2: "#134e4a", emoji: "☀️", label: "Bioclimatique"
  },

  // ── CHAUFFAGE ──
  "poele-insert": {
    url: "https://images.unsplash.com/photo-1544511916-0148ccdeb877?w=800&q=80&fit=crop",
    svgBg1: "#dc2626", svgBg2: "#7f1d1d", emoji: "🔥", label: "Poêle insert"
  },
  "radiateur-eau": {
    url: "https://images.unsplash.com/photo-1558979396-dd9f634cd28f?w=800&q=80&fit=crop",
    svgBg1: "#f97316", svgBg2: "#c2410c", emoji: "🌡️", label: "Radiateur"
  },
  "pompe-chaleur": {
    url: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&q=80&fit=crop",
    svgBg1: "#0284c7", svgBg2: "#075985", emoji: "♻️", label: "Pompe à chaleur"
  },

  // ── CUISINE ──
  "plan-stratifie": {
    url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80&fit=crop",
    svgBg1: "#e5e7eb", svgBg2: "#d1d5db", emoji: "🍽️", label: "Plan stratifié"
  },
  "plan-quartz": {
    url: "https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=800&q=80&fit=crop",
    svgBg1: "#f1f5f9", svgBg2: "#e2e8f0", emoji: "💎", label: "Quartz"
  },
  "plan-granit": {
    url: "https://images.unsplash.com/photo-1556909172-d83f85fd62d5?w=800&q=80&fit=crop",
    svgBg1: "#1c1917", svgBg2: "#0c0a09", emoji: "⬛", label: "Granit / Marbre"
  },

  // ── ESCALIER ──
  "escalier-bois": {
    url: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&q=80&fit=crop",
    svgBg1: "#92400e", svgBg2: "#78350f", emoji: "🪜", label: "Escalier bois"
  },
  "escalier-metal-bois": {
    url: "https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=800&q=80&fit=crop",
    svgBg1: "#374151", svgBg2: "#111827", emoji: "🪜", label: "Métal et bois"
  },
  "escalier-beton": {
    url: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800&q=80&fit=crop",
    svgBg1: "#6b7280", svgBg2: "#374151", emoji: "🪜", label: "Escalier béton"
  },

  // ── BETON DRAINANT ──
  "beton-drainant": {
    url: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=800&q=80&fit=crop",
    svgBg1: "#6b7280", svgBg2: "#374151", emoji: "⬜", label: "Béton drainant"
  },
};

// ─── COMPOSANT IMAGE AVEC FALLBACK SVG PREMIUM ───────────────

interface MaterialImageProps {
  materialId: string;
  materialName: string;
  className?: string;
  isSelected?: boolean;
}

export function MaterialImage({
  materialId,
  materialName,
  className = "w-full h-28 object-cover",
  isSelected = false,
}: MaterialImageProps) {
  const [useFallback, setUseFallback] = useState(false);
  const config = MATERIAL_IMAGES[materialId];

  // Fallback SVG premium — jamais de 404, toujours affiché
  if (!config || useFallback) {
    const bg1 = config?.svgBg1 ?? "#1e293b";
    const bg2 = config?.svgBg2 ?? "#0f172a";
    const emoji = config?.emoji ?? "🔨";
    const label = config?.label ?? materialName;

    return (
      <div
        className={className}
        style={{
          background: `linear-gradient(135deg, ${bg1}, ${bg2})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Pattern de fond subtil */}
        <svg
          className="absolute inset-0 w-full h-full opacity-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={`grid-${materialId}`} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#grid-${materialId})`} />
        </svg>

        {/* Contenu */}
        <span style={{ fontSize: "28px", lineHeight: 1 }}>{emoji}</span>
        <span
          style={{
            color: "rgba(255,255,255,0.9)",
            fontSize: "10px",
            fontWeight: 600,
            textAlign: "center",
            padding: "0 8px",
            lineHeight: 1.2,
          }}
        >
          {label}
        </span>

        {/* Anneau sélection */}
        {isSelected && (
          <div className="absolute inset-0 ring-2 ring-inset ring-indigo-500/70 rounded-t-xl pointer-events-none" />
        )}
      </div>
    );
  }

  // Tentative avec la vraie photo
  return (
    <div className="relative overflow-hidden" style={{ display: "contents" }}>
      <img
        src={config.url}
        alt={materialName}
        className={`${className} group-hover:scale-110 transition-transform duration-700`}
        loading="lazy"
        onError={() => setUseFallback(true)}
      />
      {isSelected && (
        <div className="absolute inset-0 ring-2 ring-inset ring-indigo-500/70 rounded-t-xl pointer-events-none" />
      )}
    </div>
  );
}
