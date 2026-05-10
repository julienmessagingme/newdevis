// cockpit-ui.jsx
// Reusable in-product mockup fragments — sized for motion design.
// Pulled from /ui_kits/cockpit but rebuilt as primitives that animate.
// All sizing is relative so they can be placed inside any Stage canvas.

const COL = {
  page: '#F5F6FA',
  card: '#FFFFFF',
  border: '#E6E8EE',
  borderSoft: '#F1F2F5',
  text: '#1A2233',
  muted: '#677084',
  mutedLight: '#9aa1b2',
  primary: '#1B3FA1',
  cockpitBlue: '#2563EB',
  cockpitBlue50: '#EFF4FF',
  cockpitBlue100: '#DBE6FF',
  emerald: '#16A34A',
  emeraldBg: '#E5F8EE',
  violet: '#7C3AED',
  violetBg: '#F3EEFE',
  amber: '#F58A06',
  amberBg: '#FEF1E0',
  scoreGreen: '#1FB664',
  scoreGreenBg: '#E5F8EE',
  scoreOrange: '#F58A06',
  scoreOrangeBg: '#FEF1E0',
  scoreRed: '#DD3838',
  scoreRedBg: '#FBE5E5',
};

const FONT = '"DM Sans", system-ui, -apple-system, sans-serif';

// ───── Eyebrow micro-label ─────
function Eyebrow({ children, color = COL.mutedLight, style }) {
  return (
    <span style={{
      fontFamily: FONT,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color,
      lineHeight: 1,
      ...style,
    }}>{children}</span>
  );
}

// ───── Score traffic-light pill ─────
function ScorePill({ tone = 'green', label, scale = 1 }) {
  const conf = {
    green:  { bg: COL.scoreGreenBg,  fg: '#0B6B3C', dot: COL.scoreGreen,  text: 'FEU VERT' },
    orange: { bg: COL.scoreOrangeBg, fg: '#7A4400', dot: COL.scoreOrange, text: 'FEU ORANGE' },
    red:    { bg: COL.scoreRedBg,    fg: '#7A1F1F', dot: COL.scoreRed,    text: 'FEU ROUGE' },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8 * scale,
      padding: `${6 * scale}px ${12 * scale}px`,
      borderRadius: 999,
      background: conf.bg,
      border: `1px solid ${conf.dot}40`,
      color: conf.fg,
      fontFamily: FONT, fontWeight: 700,
      fontSize: 12 * scale, letterSpacing: '0.04em',
    }}>
      <span style={{
        width: 6 * scale, height: 6 * scale, borderRadius: 999, background: conf.dot,
      }} />
      {label || conf.text}
    </span>
  );
}

// ───── KPI item (Budget · Engagé · Payé) ─────
function KPI({ label, value, color = COL.text, scale = 1 }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 70 * scale }}>
      <div style={{
        fontFamily: FONT, fontSize: 10 * scale, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: COL.mutedLight, marginBottom: 4 * scale,
      }}>{label}</div>
      <div style={{
        fontFamily: FONT, fontSize: 18 * scale, fontWeight: 800,
        fontVariantNumeric: 'tabular-nums', color,
        letterSpacing: '-0.01em',
      }}>{value}</div>
    </div>
  );
}

// ───── Cockpit page header (sticky band) ─────
function CockpitHeader({ projectName, emoji = '🏠', kpis, scale = 1 }) {
  return (
    <div style={{
      background: COL.card,
      borderBottom: `1px solid ${COL.borderSoft}`,
      padding: `${14 * scale}px ${20 * scale}px`,
      display: 'flex', alignItems: 'center', gap: 16 * scale,
      fontFamily: FONT,
    }}>
      <div style={{
        width: 40 * scale, height: 40 * scale, borderRadius: 12 * scale,
        background: 'linear-gradient(135deg, #EFF4FF 0%, #DBE6FF 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20 * scale, flexShrink: 0,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>{emoji}</div>
      <div style={{ minWidth: 0, flex: '0 0 auto' }}>
        <Eyebrow color={COL.mutedLight} style={{ marginBottom: 3 * scale, display: 'block' }}>Mon chantier</Eyebrow>
        <div style={{
          fontFamily: FONT, fontWeight: 700,
          fontSize: 14 * scale, color: COL.text,
          letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        }}>{projectName}</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 * scale }}>
        {kpis.map((k, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ width: 1, height: 32 * scale, background: COL.borderSoft }} />}
            <KPI {...k} scale={scale} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ───── Card primitive ─────
function Card({ children, style, padding = 20, scale = 1 }) {
  return (
    <div style={{
      background: COL.card,
      border: `1px solid ${COL.borderSoft}`,
      borderRadius: 16 * scale,
      padding: padding * scale,
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04), 0 2px 4px -2px rgba(0,0,0,0.04)',
      fontFamily: FONT,
      ...style,
    }}>{children}</div>
  );
}

// ───── Pilote IA hero card (dark gradient blue) ─────
function PiloteIACard({ scale = 1, headline = '3 décisions à valider depuis hier', sub = "L'assistant a analysé un nouveau devis et planifié 2 rappels.", style }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 60%, #312E81 100%)',
      borderRadius: 16 * scale,
      padding: 20 * scale,
      color: '#fff',
      fontFamily: FONT,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 10px 24px -8px rgba(37,99,235,0.45)',
      ...style,
    }}>
      <div style={{
        position: 'absolute', right: -30 * scale, top: -30 * scale,
        width: 120 * scale, height: 120 * scale, borderRadius: '50%',
        background: 'rgba(255,255,255,0.10)', filter: 'blur(20px)',
      }} />
      <div style={{ position: 'relative' }}>
        <div style={{
          width: 36 * scale, height: 36 * scale, borderRadius: 12 * scale,
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12 * scale,
        }}>
          <BotIcon size={20 * scale} color="#fff" />
        </div>
        <Eyebrow color="rgba(255,255,255,0.7)" style={{ display: 'block', marginBottom: 6 * scale }}>
          Pilote de chantier
        </Eyebrow>
        <div style={{
          fontWeight: 700, fontSize: 16 * scale, lineHeight: 1.3,
          marginBottom: 8 * scale, letterSpacing: '-0.01em',
        }}>{headline}</div>
        <div style={{ fontSize: 12 * scale, opacity: 0.85, lineHeight: 1.5 }}>{sub}</div>
      </div>
    </div>
  );
}

// ───── Lot card mini ─────
function LotCardMini({ emoji = '🔧', name = 'Plomberie', devisCount = 2, factureCount = 1, refRange = '12k – 18k', insight, scale = 1, style }) {
  return (
    <div style={{
      background: COL.card,
      border: `1px solid ${COL.borderSoft}`,
      borderRadius: 16 * scale,
      overflow: 'hidden',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
      fontFamily: FONT,
      display: 'flex', flexDirection: 'column',
      ...style,
    }}>
      <div style={{ padding: 16 * scale, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 * scale, marginBottom: 10 * scale }}>
          <span style={{ fontSize: 20 * scale, lineHeight: 1 }}>{emoji}</span>
          <span style={{ fontWeight: 700, fontSize: 13 * scale, color: COL.text }}>{name}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 * scale, marginBottom: 8 * scale, flexWrap: 'wrap' }}>
          {devisCount > 0 && (
            <span style={{
              fontSize: 11 * scale, fontWeight: 500,
              color: '#1D4ED8', background: COL.cockpitBlue50,
              padding: `${2 * scale}px ${8 * scale}px`, borderRadius: 999,
            }}>{devisCount} devis</span>
          )}
          {factureCount > 0 && (
            <span style={{
              fontSize: 11 * scale, fontWeight: 500,
              color: COL.violet, background: COL.violetBg,
              padding: `${2 * scale}px ${8 * scale}px`, borderRadius: 999,
            }}>{factureCount} facture{factureCount > 1 ? 's' : ''}</span>
          )}
        </div>
        <div style={{ fontSize: 11 * scale, color: COL.mutedLight }}>Réf. marché · {refRange}</div>
      </div>
      {insight && (
        <div style={{
          padding: `${8 * scale}px ${14 * scale}px`,
          background: insight.bg,
          borderTop: `1px solid ${COL.borderSoft}`,
          borderLeft: `4px solid ${insight.border}`,
          display: 'flex', alignItems: 'center', gap: 6 * scale,
        }}>
          {insight.icon && <span style={{ fontSize: 11 * scale }}>{insight.icon}</span>}
          <span style={{
            fontSize: 11 * scale, fontWeight: 600,
            color: insight.text,
          }}>{insight.label}</span>
        </div>
      )}
    </div>
  );
}

// ───── WhatsApp message bubble ─────
function WAMessage({ from = 'left', sender, text, time, scale = 1, style }) {
  const isMe = from === 'right';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isMe ? 'flex-end' : 'flex-start',
      fontFamily: FONT,
      ...style,
    }}>
      <div style={{
        maxWidth: '78%',
        background: isMe ? '#DCF8C6' : COL.card,
        border: `1px solid ${isMe ? '#C3E5A6' : COL.borderSoft}`,
        padding: `${8 * scale}px ${12 * scale}px`,
        borderRadius: 14 * scale,
        borderBottomRightRadius: isMe ? 4 * scale : 14 * scale,
        borderBottomLeftRadius: isMe ? 14 * scale : 4 * scale,
        boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
      }}>
        {sender && !isMe && (
          <div style={{
            fontSize: 10 * scale, fontWeight: 700,
            color: COL.cockpitBlue, marginBottom: 2 * scale,
          }}>{sender}</div>
        )}
        <div style={{ fontSize: 13 * scale, color: COL.text, lineHeight: 1.35 }}>{text}</div>
        {time && (
          <div style={{
            fontSize: 9 * scale, color: COL.mutedLight,
            textAlign: 'right', marginTop: 3 * scale,
          }}>{time}</div>
        )}
      </div>
    </div>
  );
}

// ───── Document card (PDF row) ─────
function DocRow({ icon = '📄', name, kind, amount, kindColor = COL.cockpitBlue, kindBg = COL.cockpitBlue50, scale = 1, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12 * scale,
      padding: `${10 * scale}px ${14 * scale}px`,
      background: COL.card,
      border: `1px solid ${COL.borderSoft}`,
      borderRadius: 12 * scale,
      fontFamily: FONT,
      ...style,
    }}>
      <div style={{
        width: 32 * scale, height: 40 * scale,
        background: '#fff', border: `1px solid ${COL.border}`,
        borderRadius: 4 * scale,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14 * scale,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12 * scale, fontWeight: 600,
          color: COL.text, marginBottom: 2 * scale,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{name}</div>
        <span style={{
          display: 'inline-block',
          fontSize: 9 * scale, fontWeight: 700,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: kindColor, background: kindBg,
          padding: `${1 * scale}px ${6 * scale}px`, borderRadius: 999,
        }}>{kind}</span>
      </div>
      {amount && (
        <div style={{
          fontSize: 13 * scale, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums', color: COL.text,
        }}>{amount}</div>
      )}
    </div>
  );
}

// ───── Budget bar (animated width) ─────
function BudgetBar({ pct = 62, scale = 1, color = COL.cockpitBlue, style }) {
  return (
    <div style={{
      width: '100%', height: 8 * scale,
      background: '#EEF0F4', borderRadius: 999,
      overflow: 'hidden', ...style,
    }}>
      <div style={{
        width: `${pct}%`, height: '100%',
        background: color, borderRadius: 999,
        transition: 'width 600ms cubic-bezier(0.4,0,0.2,1)',
      }} />
    </div>
  );
}

// ───── Bot icon (Lucide-style stroke) ─────
function BotIcon({ size = 24, color = COL.text, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8"/>
      <rect width="16" height="12" x="4" y="8" rx="2"/>
      <path d="M2 14h2"/><path d="M20 14h2"/>
      <path d="M15 13v2"/><path d="M9 13v2"/>
    </svg>
  );
}

function WhatsAppIcon({ size = 24, color = '#25D366' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488"/>
    </svg>
  );
}

function FileIcon({ size = 24, color = COL.cockpitBlue }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
    </svg>
  );
}

function CalendarIcon({ size = 24, color = COL.text }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  );
}

function WalletIcon({ size = 24, color = COL.text }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4"/>
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
    </svg>
  );
}

function FolderIcon({ size = 24, color = COL.text }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
    </svg>
  );
}

// ───── Phone frame (slim, neutral) ─────
function PhoneFrame({ width = 360, height = 760, children, scale = 1, style }) {
  return (
    <div style={{
      width: width * scale, height: height * scale,
      background: '#1A2233',
      borderRadius: 44 * scale,
      padding: 8 * scale,
      boxShadow: '0 30px 80px -20px rgba(15,25,50,0.55), 0 0 0 1.5px #2A3245',
      position: 'relative',
      ...style,
    }}>
      <div style={{
        width: '100%', height: '100%',
        background: COL.page,
        borderRadius: 36 * scale,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Notch */}
        <div style={{
          position: 'absolute', top: 8 * scale, left: '50%',
          transform: 'translateX(-50%)',
          width: 100 * scale, height: 22 * scale,
          background: '#1A2233', borderRadius: 999, zIndex: 5,
        }} />
        {children}
      </div>
    </div>
  );
}

Object.assign(window, {
  COL, FONT,
  Eyebrow, ScorePill, KPI,
  CockpitHeader, Card, PiloteIACard, LotCardMini,
  WAMessage, DocRow, BudgetBar,
  BotIcon, WhatsAppIcon, FileIcon, CalendarIcon, WalletIcon, FolderIcon,
  PhoneFrame,
});
