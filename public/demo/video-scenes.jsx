// video-scenes.jsx — scenes for "Pourquoi Gérer Mon Chantier" motion design

const C = {
  navy:   '#1A4A7F',
  gold:   '#D4A547',
  sage:   '#3A8A65',
  red:    '#C73E2F',
  cream:  '#F5F1E8',
  muted:  '#7A8B9C',
  line:   '#E5DCC8',
  body:   '#2E3B4E',
  white:  '#FFFFFF',
};

const FONT_SANS = 'Inter, system-ui, sans-serif';
const FONT_MONO = 'JetBrains Mono, ui-monospace, monospace';
const FONT_DISPLAY = 'Syne, Inter, system-ui, sans-serif';

// GMC brand accent (logo's orange — kept as identity)
const BRAND_ORANGE = '#F58A06';
const BRAND_BADGE = '#1B3FA1';

// ─────────────────────────────────────────────────────────────
// GMC Logo — inline SVG badge + wordmark
// ─────────────────────────────────────────────────────────────
function GMCMark({ size = 64, dark = false, animated = false, animKey = 0 }) {
  const orange = BRAND_ORANGE;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none"
         style={{ display: 'block', flexShrink: 0 }}>
      <rect x="2" y="2" width="44" height="44" rx="11" fill={dark ? C.gold : BRAND_BADGE} />
      <rect x="2" y="2" width="44" height="44" rx="11" fill={`url(#gmc-shine-${animKey})`} opacity="0.18" />
      <g opacity="0.18" stroke="#fff" strokeWidth="0.5">
        <path d="M8 14h32M8 22h32M8 30h32M8 38h32M14 8v32M22 8v32M30 8v32M38 8v32"/>
      </g>
      <path d="M11 30 L24 18 L37 30 L37 39 L11 39 Z"
            stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
      <rect x="21" y="32" width="6" height="7" stroke="#fff" strokeWidth="1.6" fill="none"/>
      <line x1="14" y1="12" x2="32" y2="12" stroke={orange} strokeWidth="2" strokeLinecap="round"/>
      <line x1="14" y1="12" x2="14" y2="30" stroke={orange} strokeWidth="2" strokeLinecap="round"/>
      <line x1="29" y1="12" x2="29" y2="20" stroke="#fff" strokeWidth="1" strokeDasharray="2 2"/>
      <rect x="27" y="20" width="4" height="3" fill={orange}/>
      <defs>
        <linearGradient id={`gmc-shine-${animKey}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff"/>
          <stop offset="1" stopColor="#fff" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function GMCWordmark({ size = 36, color = C.navy, sub = 'Pilote ton chantier au millimètre', subColor = C.muted }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1 }}>
      <span style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 800,
        fontSize: size,
        color,
        letterSpacing: '-0.02em',
      }}>
        Gérer<span style={{ color: BRAND_ORANGE }}>Mon</span>Chantier
      </span>
      {sub && (
        <span style={{
          fontFamily: FONT_SANS,
          fontWeight: 700,
          fontSize: Math.max(10, size * 0.32),
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: subColor,
        }}>{sub}</span>
      )}
    </div>
  );
}

function GMCLogo({ markSize = 72, fontSize = 36, color = C.navy, subColor = C.muted, sub = 'Pilote ton chantier au millimètre', dark = false, animKey = 0 }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: markSize * 0.25 }}>
      <GMCMark size={markSize} dark={dark} animKey={animKey} />
      <GMCWordmark size={fontSize} color={color} subColor={subColor} sub={sub} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────
const eo = window.Easing.easeOutCubic;
const eoBack = window.Easing.easeOutBack;
const eio = window.Easing.easeInOutCubic;

function ease(t, fn = eo) { return fn(window.clamp(t, 0, 1)); }

function FadeIn({ start = 0, dur = 0.6, from = 20, children, style = {} }) {
  const time = window.useTime();
  const t = window.clamp((time - start) / dur, 0, 1);
  const e = ease(t, eo);
  return (
    <div style={{
      ...style,
      opacity: e,
      transform: `translateY(${(1 - e) * from}px)`,
      willChange: 'opacity, transform',
    }}>
      {children}
    </div>
  );
}

function PopIn({ start = 0, dur = 0.5, children, style = {} }) {
  const time = window.useTime();
  const t = window.clamp((time - start) / dur, 0, 1);
  const e = ease(t, eoBack);
  return (
    <div style={{
      ...style,
      opacity: window.clamp(t * 2.2, 0, 1),
      transform: `scale(${0.7 + 0.3 * e})`,
      transformOrigin: 'center',
      willChange: 'opacity, transform',
    }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE 1 — Title
// ─────────────────────────────────────────────────────────────
function SceneTitle() {
  const time = window.useTime();
  const { localTime, duration } = window.useSprite();

  // logo rotates in
  const logoT = ease(window.clamp(localTime / 0.7, 0, 1), eoBack);
  const titleT = ease(window.clamp((localTime - 0.4) / 0.7, 0, 1), eo);
  const subT  = ease(window.clamp((localTime - 0.9) / 0.6, 0, 1), eo);

  const exitT = window.clamp((localTime - (duration - 0.5)) / 0.5, 0, 1);
  const outOp = 1 - ease(exitT, eio);

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, opacity: outOp }}>
      {/* subtle cross-hatch background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 38%, rgba(212,165,71,0.12) 0%, transparent 55%)`,
      }} />

      <div style={{
        position: 'absolute', left: '50%', top: 320,
        transform: 'translate(-50%, 0)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36,
      }}>
        {/* GMC logo lockup */}
        <div style={{
          opacity: logoT,
          transform: `scale(${0.7 + 0.3 * logoT})`,
          transformOrigin: 'center',
          filter: `drop-shadow(0 24px 60px rgba(27,63,161,${0.20 * logoT}))`,
        }}>
          <GMCLogo markSize={120} fontSize={56} color={C.navy} subColor={C.muted}
                   sub="Pilote ton chantier au millimètre" />
        </div>

        <div style={{
          fontFamily: FONT_MONO,
          fontSize: 18, fontWeight: 700,
          color: C.gold,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          opacity: titleT,
          transform: `translateY(${(1 - titleT) * 12}px)`,
          marginTop: 8,
        }}>
          gerermonchantier.fr
        </div>

        <div style={{
          fontFamily: FONT_SANS,
          fontSize: 100, fontWeight: 700,
          color: C.navy,
          letterSpacing: '-0.035em',
          lineHeight: 1,
          textAlign: 'center',
          opacity: titleT,
          transform: `translateY(${(1 - titleT) * 24}px)`,
        }}>
          Un chantier, c'est toujours compliqué
          <span style={{ color: BRAND_ORANGE }}>*</span>
          <div style={{
            fontSize: 56,
            fontStyle: 'italic',
            fontWeight: 600,
            color: BRAND_ORANGE,
            letterSpacing: '-0.02em',
            marginTop: 28,
          }}>
            *sauf le tien.
          </div>
        </div>

        <div style={{
          fontFamily: FONT_SANS,
          fontSize: 28, fontWeight: 400,
          color: C.body,
          letterSpacing: '-0.005em',
          textAlign: 'center',
          opacity: subT,
          maxWidth: 1100,
          transform: `translateY(${(1 - subT) * 18}px)`,
          lineHeight: 1.4,
        }}>
          Que tu aies <b style={{ color: C.navy, fontWeight: 700 }}>1 chantier</b> ou
          <b style={{ color: C.navy, fontWeight: 700 }}> 10</b>, l'IA pilote pour toi —
          sans que tu perdes un appel, un devis ou une nuit.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE 2 — Problem (4 tickers)
// ─────────────────────────────────────────────────────────────
function SceneProblem() {
  const { localTime, duration } = window.useSprite();

  const headT = ease(window.clamp(localTime / 0.5, 0, 1), eo);
  const exitT = window.clamp((localTime - (duration - 0.5)) / 0.5, 0, 1);
  const outOp = 1 - ease(exitT, eio);

  // counter values that scale up (data inlined below)
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, opacity: outOp }}>
      <div style={{
        position: 'absolute', left: 120, top: 140,
        fontFamily: FONT_MONO,
        fontSize: 18, fontWeight: 700,
        color: C.gold,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        opacity: headT,
      }}>
        Avant GMC
      </div>

      <div style={{
        position: 'absolute', left: 120, top: 178,
        fontFamily: FONT_SANS,
        fontSize: 88, fontWeight: 700,
        color: C.navy,
        letterSpacing: '-0.03em',
        lineHeight: 1.02,
        opacity: headT,
        transform: `translateY(${(1 - headT) * 18}px)`,
      }}>
        Un seul chantier suffit<br />
        à <span style={{ color: C.red }}>te noyer</span>.
      </div>

      {/* 4 counter tiles */}
      <div style={{
        position: 'absolute', left: 120, right: 120, top: 480,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 24,
      }}>
        {[
          { label: 'Devis à comparer',       target: 18,  suffix: '',    delay: 0.6 },
          { label: 'Artisans à coordonner',  target: 8,   suffix: '',    delay: 0.9 },
          { label: 'Papiers à archiver',     target: 47,  suffix: '',    delay: 1.2 },
          { label: 'Visibilité globale',      target: 0,   suffix: ' %',  delay: 1.5, isZero: true },
        ].map((c, i) => {
          const t = window.clamp((localTime - c.delay) / 0.6, 0, 1);
          const e = ease(t, eoBack);
          const value = c.isZero ? (1 - t) * 100 : t * c.target;
          return (
            <div key={i} style={{
              background: C.white,
              border: `1px solid ${C.line}`,
              borderTop: `4px solid ${c.isZero ? C.red : C.navy}`,
              borderRadius: 18,
              padding: '32px 32px 28px',
              opacity: window.clamp(t * 2, 0, 1),
              transform: `translateY(${(1 - e) * 40}px) scale(${0.92 + 0.08 * e})`,
              boxShadow: '0 12px 32px rgba(26,74,127,0.08)',
            }}>
              <div style={{
                fontFamily: FONT_MONO,
                fontSize: 14, fontWeight: 700,
                color: C.muted,
                letterSpacing: '0.10em', textTransform: 'uppercase',
                marginBottom: 14,
              }}>
                {c.label}
              </div>
              <div style={{
                fontFamily: FONT_MONO,
                fontSize: 96, fontWeight: 700,
                color: c.isZero ? C.red : C.navy,
                letterSpacing: '-0.04em',
                lineHeight: 1,
              }}>
                {c.isZero ? Math.round(value) : Math.round(value)}
                <span style={{ fontSize: 44, opacity: 0.7, marginLeft: 4 }}>{c.suffix}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* punchline */}
      <FadeIn start={2.5} dur={0.6} from={20} style={{
        position: 'absolute', left: 0, right: 0, bottom: 80,
        textAlign: 'center',
        fontFamily: FONT_SANS,
        fontSize: 26, fontWeight: 500,
        color: C.body,
        letterSpacing: '-0.01em',
      }}>
        … et <b style={{ color: C.navy, fontWeight: 700 }}>un seul cerveau</b> pour tout tenir.
      </FadeIn>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE 3 — Hub (4 chantiers)
// ─────────────────────────────────────────────────────────────
function SceneHub() {
  const { localTime, duration } = window.useSprite();
  const headT = ease(window.clamp(localTime / 0.5, 0, 1), eo);

  const exitT = window.clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const outOp = 1 - ease(exitT, eio);

  const chantiers = [
    { city: 'LYON 7e',       desc: 'Cuisine + SDB',    amt: '47 000 €',  pct: 60, tone: 'sage', state: 'OK · S6/10',         delay: 0.4 },
    { city: 'BORDEAUX SDB',  desc: 'Salle de bain',    amt: '32 000 €',  pct: 45, tone: 'gold', state: '⚠ Tension S9',       delay: 0.7, focus: true },
    { city: 'TOULOUSE',      desc: 'Rénov. globale',   amt: '78 000 €',  pct: 22, tone: 'sage', state: 'OK · S3/14',         delay: 1.0 },
    { city: 'LILLE',         desc: 'Locatif 42 m²',    amt: '51 000 €',  pct: 90, tone: 'navy', state: 'Réception 8 j',      delay: 1.3 },
  ];

  const toneMap = {
    sage: { accent: C.sage, bar: C.sage },
    gold: { accent: C.gold, bar: C.gold },
    navy: { accent: C.navy, bar: C.navy },
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, opacity: outOp }}>

      <div style={{
        position: 'absolute', left: 120, top: 100,
        fontFamily: FONT_MONO,
        fontSize: 18, fontWeight: 700,
        color: C.gold,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        opacity: headT,
      }}>
        Étape 1 · le hub
      </div>
      <div style={{
        position: 'absolute', left: 120, top: 138,
        fontFamily: FONT_SANS,
        fontSize: 64, fontWeight: 700,
        color: C.navy,
        letterSpacing: '-0.025em',
        lineHeight: 1.1,
        opacity: headT,
        transform: `translateY(${(1 - headT) * 16}px)`,
      }}>
        1 chantier ou 10 — le même cockpit.
      </div>
      <div style={{
        position: 'absolute', left: 120, top: 232,
        fontFamily: FONT_MONO,
        fontSize: 22, fontWeight: 500,
        color: C.muted,
        opacity: headT,
      }}>
        Solo, courtier, family office · le hub s'adapte →
      </div>

      {/* Grid 2×2 */}
      <div style={{
        position: 'absolute',
        left: 120, right: 120,
        top: 320, bottom: 100,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 24,
      }}>
        {chantiers.map((ch, i) => {
          const t = window.clamp((localTime - ch.delay) / 0.55, 0, 1);
          const e = ease(t, eoBack);
          const tone = toneMap[ch.tone];

          // pulse on bordeaux late in scene
          let pulseScale = 1;
          let pulseGlow = 0;
          if (ch.focus && localTime > 2.4) {
            const pt = (localTime - 2.4);
            pulseScale = 1 + 0.018 * Math.sin(pt * 4.5);
            pulseGlow = 0.4 + 0.4 * Math.sin(pt * 4.5);
          }

          return (
            <div key={i} style={{
              background: C.white,
              border: `1px solid ${C.line}`,
              borderTop: `4px solid ${tone.accent}`,
              borderRadius: 18,
              padding: '28px 32px',
              display: 'flex', flexDirection: 'column', gap: 18,
              opacity: window.clamp(t * 2, 0, 1),
              transform: `translateY(${(1 - e) * 32}px) scale(${(0.92 + 0.08 * e) * pulseScale})`,
              transformOrigin: 'center',
              boxShadow: ch.focus
                ? `0 20px 48px rgba(212,165,71,${0.18 + pulseGlow * 0.18})`
                : '0 12px 32px rgba(26,74,127,0.08)',
              position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: tone.accent, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24,
                  }}>🏠</div>
                  <div>
                    <div style={{
                      fontFamily: FONT_SANS,
                      fontSize: 14, fontWeight: 700,
                      color: C.muted,
                      letterSpacing: '0.10em', textTransform: 'uppercase',
                    }}>{ch.city}</div>
                    <div style={{
                      fontFamily: FONT_SANS,
                      fontSize: 22, fontWeight: 600,
                      color: C.navy,
                      letterSpacing: '-0.01em',
                      marginTop: 4,
                    }}>{ch.desc}</div>
                  </div>
                </div>
                <div style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  background: ch.focus ? 'rgba(199,62,47,0.10)' : 'rgba(58,138,101,0.10)',
                  border: `1px solid ${ch.focus ? 'rgba(199,62,47,0.35)' : 'rgba(58,138,101,0.32)'}`,
                  color: ch.focus ? C.red : C.sage,
                  fontFamily: FONT_MONO,
                  fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {ch.state}
                </div>
              </div>

              <div style={{
                fontFamily: FONT_MONO,
                fontSize: 52, fontWeight: 700,
                color: C.gold,
                letterSpacing: '-0.025em',
                lineHeight: 1,
              }}>{ch.amt}</div>

              <div style={{ marginTop: 'auto' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600,
                  color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  <span>Avancement</span>
                  <span style={{ color: C.navy, fontWeight: 700 }}>{ch.pct} %</span>
                </div>
                <div style={{
                  height: 10, borderRadius: 5,
                  background: 'rgba(26,74,127,0.08)',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${ch.pct * ease(window.clamp((localTime - ch.delay - 0.4) / 0.6, 0, 1), eo)}%`,
                    background: tone.bar,
                    borderRadius: 5,
                  }} />
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE 4 — Gantt cascade
// ─────────────────────────────────────────────────────────────
function SceneGantt() {
  const { localTime, duration } = window.useSprite();
  const headT = ease(window.clamp(localTime / 0.5, 0, 1), eo);
  const exitT = window.clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const outOp = 1 - ease(exitT, eio);

  // Timing within scene:
  // 0.4: bars enter
  // 1.6: +5j flag drops
  // 2.4: 3 ghost bars appear + new bars slide right
  // 3.4: confirmation band

  const flagT = ease(window.clamp((localTime - 1.6) / 0.45, 0, 1), eoBack);
  const cascadeT = ease(window.clamp((localTime - 2.4) / 0.8, 0, 1), eio);
  const bandT = ease(window.clamp((localTime - 3.4) / 0.5, 0, 1), eo);

  const lots = [
    { name: 'Maçon',       comp: 'SARL Bx Construction',  emoji: '🧱', start: 10, end: 40, color: C.navy,           label: '3 sem.',       delay: 0.4, shift: 0 },
    { name: 'Plombier',    comp: 'Aqua Bordeaux',         emoji: '🔧', start: 30, end: 50, color: C.navy + 'CC',    label: '',             delay: 0.7, shift: 0, hasFlag: true },
    { name: 'Électricien', comp: 'Élec33',                emoji: '⚡', start: 40, end: 60, color: C.gold,           label: 'décalé',       delay: 1.0, shift: 10 },
    { name: 'Carreleur',   comp: 'Carrelage Atlantique',  emoji: '🟫', start: 50, end: 70, color: C.sage,           label: 'décalé',       delay: 1.3, shift: 10 },
  ];

  const trackLeft = 360;
  const trackRight = 1800;
  const trackWidth = trackRight - trackLeft;
  const pxPerPct = trackWidth / 100;

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, opacity: outOp }}>

      <div style={{
        position: 'absolute', left: 120, top: 80,
        fontFamily: FONT_MONO,
        fontSize: 18, fontWeight: 700,
        color: C.gold,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        opacity: headT,
      }}>
        Étape 4 · gère ton planning
      </div>
      <div style={{
        position: 'absolute', left: 120, top: 118,
        fontFamily: FONT_SANS,
        fontSize: 60, fontWeight: 700,
        color: C.navy,
        letterSpacing: '-0.025em',
        opacity: headT,
        transform: `translateY(${(1 - headT) * 16}px)`,
      }}>
        Plombier <span style={{ color: C.red }}>+5 jours</span> — cascade auto, lots aval re-calés.
      </div>

      {/* Week axis */}
      <div style={{
        position: 'absolute', left: trackLeft, right: 120, top: 280,
        display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)',
        paddingBottom: 14, borderBottom: `1px solid ${C.line}`,
        opacity: headT,
      }}>
        {['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10'].map((w, i) => (
          <div key={i} style={{
            fontFamily: FONT_MONO, fontSize: 16, fontWeight: 600,
            color: i === 4 ? C.red : C.muted,
            textAlign: 'center', letterSpacing: '0.04em',
          }}>{w}</div>
        ))}
      </div>

      {/* Vertical "today" line at end of plombier (S5 boundary = 50%) */}
      <div style={{
        position: 'absolute',
        left: trackLeft + 0.50 * trackWidth,
        top: 310, bottom: 200,
        width: 0,
        borderLeft: `2px dashed rgba(212,165,71,0.55)`,
        opacity: ease(window.clamp((localTime - 1.4) / 0.4, 0, 1), eo),
      }} />

      {/* Lot rows */}
      {lots.map((lot, i) => {
        const rowTop = 320 + i * 88;
        const t = window.clamp((localTime - lot.delay) / 0.5, 0, 1);
        const enterE = ease(t, eo);

        const shiftPct = lot.shift * cascadeT;
        const ghostOpacity = lot.shift ? window.clamp((localTime - 2.0) / 0.4, 0, 1) * (1 - exitT * 0.5) : 0;

        return (
          <React.Fragment key={i}>
            {/* Lot label */}
            <div style={{
              position: 'absolute', left: 120, top: rowTop + 18,
              opacity: enterE,
              transform: `translateX(${(1 - enterE) * -12}px)`,
            }}>
              <div style={{
                fontFamily: FONT_SANS,
                fontSize: 22, fontWeight: 600,
                color: C.navy, letterSpacing: '-0.01em',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 22 }}>{lot.emoji}</span>
                {lot.name}
              </div>
              <div style={{
                fontFamily: FONT_MONO,
                fontSize: 14, fontWeight: 400,
                color: C.muted,
                marginTop: 4,
              }}>{lot.comp}</div>
            </div>

            {/* Ghost (old position) — only for shifted lots */}
            {lot.shift > 0 && (
              <div style={{
                position: 'absolute',
                left: trackLeft + lot.start * pxPerPct,
                top: rowTop + 18,
                width: (lot.end - lot.start) * pxPerPct,
                height: 44,
                borderRadius: 9,
                border: `2px dashed rgba(122,139,156,0.55)`,
                background: 'repeating-linear-gradient(135deg, rgba(122,139,156,0.06) 0 8px, transparent 8px 16px)',
                opacity: ghostOpacity * 0.9,
                display: 'flex', alignItems: 'center',
                padding: '0 14px',
                fontFamily: FONT_MONO,
                fontSize: 13, fontWeight: 500,
                color: C.muted,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Ancien
              </div>
            )}

            {/* Active bar */}
            <div style={{
              position: 'absolute',
              left: trackLeft + (lot.start + shiftPct) * pxPerPct,
              top: rowTop + 18,
              width: (lot.end - lot.start) * pxPerPct,
              height: 44,
              borderRadius: 9,
              background: lot.color,
              color: lot.color === C.gold ? '#3D2C0A' : '#fff',
              display: 'flex', alignItems: 'center',
              padding: '0 16px',
              fontFamily: FONT_SANS,
              fontSize: 18, fontWeight: 600,
              letterSpacing: '-0.005em',
              opacity: enterE,
              transform: `scale(${0.96 + 0.04 * enterE})`,
              transformOrigin: 'left center',
              boxShadow: '0 4px 10px rgba(0,0,0,0.10)',
              borderTopRightRadius: lot.hasFlag ? 0 : 9,
              borderBottomRightRadius: lot.hasFlag ? 0 : 9,
            }}>
              <span>{lot.name === 'Plombier' ? 'Plomberie' : lot.name === 'Maçon' ? 'Maçonnerie' : lot.name === 'Électricien' ? 'Électricité' : 'Carrelage'}</span>
              {lot.label && (
                <span style={{
                  marginLeft: 'auto', opacity: 0.85,
                  fontFamily: FONT_MONO, fontSize: 14, fontWeight: 500,
                }}>{lot.label}</span>
              )}
            </div>

            {/* +5j red flag attached to plombier */}
            {lot.hasFlag && flagT > 0 && (
              <div style={{
                position: 'absolute',
                left: trackLeft + lot.end * pxPerPct,
                top: rowTop + 18,
                height: 44,
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 14px 0 16px',
                background: C.red,
                color: '#fff',
                fontFamily: FONT_SANS,
                fontWeight: 700, fontSize: 20,
                borderRadius: '0 9px 9px 0',
                boxShadow: '0 6px 16px rgba(199,62,47,0.40)',
                opacity: flagT,
                transform: `translateY(${(1 - flagT) * -28}px) scale(${0.85 + 0.15 * flagT})`,
                transformOrigin: 'left center',
                zIndex: 3,
              }}>
                ⚠ +5 j
              </div>
            )}

          </React.Fragment>
        );
      })}

      {/* Confirmation band */}
      <div style={{
        position: 'absolute',
        left: 120, right: 120, bottom: 60,
        opacity: bandT,
        transform: `translateY(${(1 - bandT) * 16}px)`,
        background: 'rgba(58,138,101,0.10)',
        border: `1px solid rgba(58,138,101,0.30)`,
        borderLeft: `6px solid ${C.sage}`,
        borderRadius: 14,
        padding: '20px 26px',
        display: 'flex', alignItems: 'center', gap: 18,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: C.sage, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 700,
        }}>✓</div>
        <div style={{
          fontFamily: FONT_SANS, fontSize: 22, fontWeight: 500,
          color: C.body, lineHeight: 1.35,
        }}>
          <b style={{ color: '#243E1A', fontWeight: 700 }}>Cascade appliquée automatiquement</b> ·
          3 lots aval décalés · Carreleur notifié par WhatsApp ·
          Nouvelle réception : <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.sage }}>28 juin 2026</span>
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE 5 — WhatsApp
// ─────────────────────────────────────────────────────────────
function SceneWhatsApp() {
  const { localTime, duration } = window.useSprite();
  const headT = ease(window.clamp(localTime / 0.5, 0, 1), eo);
  const exitT = window.clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const outOp = 1 - ease(exitT, eio);

  // bubbles drop in sequentially
  const b1T = ease(window.clamp((localTime - 0.8) / 0.4, 0, 1), eoBack);
  const b2T = ease(window.clamp((localTime - 1.8) / 0.4, 0, 1), eoBack);
  const b3T = ease(window.clamp((localTime - 2.6) / 0.4, 0, 1), eoBack);

  const PHONE_W = 480, PHONE_H = 880;
  const phoneX = 1100;
  const phoneY = 100;

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, opacity: outOp }}>

      {/* Left side: callout */}
      <div style={{
        position: 'absolute', left: 120, top: 160, width: 940,
      }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700,
          color: C.gold,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          opacity: headT,
        }}>
          Et qui pilote tout ça&nbsp;?
        </div>
        <div style={{
          fontFamily: FONT_SANS,
          fontSize: 96, fontWeight: 700,
          color: C.navy,
          letterSpacing: '-0.03em',
          lineHeight: 1.02,
          marginTop: 14,
          opacity: headT,
          transform: `translateY(${(1 - headT) * 18}px)`,
        }}>
          Tout est dans<br />
          <span style={{ color: C.gold, position: 'relative', display: 'inline-block' }}>
            WhatsApp.
            <span style={{
              position: 'absolute', left: 0, right: 0, bottom: 4,
              height: 8, borderRadius: 4,
              background: 'rgba(212,165,71,0.30)',
              zIndex: -1,
            }} />
          </span>
        </div>

        <FadeIn start={0.7} dur={0.6} style={{
          fontFamily: FONT_SANS,
          fontSize: 28, fontWeight: 400,
          color: C.body,
          lineHeight: 1.45,
          marginTop: 36,
          maxWidth: 720,
        }}>
          Pas d'app à télécharger, pas de mot de passe.
          <b style={{ color: C.navy, fontWeight: 700 }}> L'IA fait le job pour toi</b>
          — elle détecte, notifie, propose, applique.
          Toi, tu valides en un mot.
        </FadeIn>

        {/* mini stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, max-content)',
          gap: 28, marginTop: 60,
        }}>
          {[
            { v: '60 s',  l: 'Détection → cascade', delay: 1.5, color: C.gold },
            { v: '3',     l: 'Lots re-planifiés',   delay: 1.7, color: C.navy },
            { v: '0',     l: 'Coup de fil',         delay: 1.9, color: C.sage },
          ].map((s, i) => {
            const t = window.clamp((localTime - s.delay) / 0.5, 0, 1);
            const e = ease(t, eoBack);
            return (
              <div key={i} style={{
                background: C.white, border: `1px solid ${C.line}`,
                borderRadius: 14, padding: '20px 26px',
                opacity: window.clamp(t * 2, 0, 1),
                transform: `translateY(${(1 - e) * 24}px) scale(${0.9 + 0.1 * e})`,
              }}>
                <div style={{
                  fontFamily: FONT_MONO, fontSize: 44, fontWeight: 700,
                  color: s.color, letterSpacing: '-0.025em', lineHeight: 1,
                }}>{s.v}</div>
                <div style={{
                  fontFamily: FONT_SANS, fontSize: 15, fontWeight: 500,
                  color: C.muted, marginTop: 8,
                }}>{s.l}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* iPhone phone */}
      <div style={{
        position: 'absolute',
        left: phoneX, top: phoneY,
        width: PHONE_W, height: PHONE_H,
        background: 'linear-gradient(155deg,#3a3a3c 0%,#1f1f21 45%,#0d0d0f 100%)',
        borderRadius: 64, padding: 14,
        boxShadow: '0 60px 120px -30px rgba(0,0,0,0.65), 0 24px 48px -12px rgba(0,0,0,0.30), inset 0 1px 1px rgba(255,255,255,0.10)',
        opacity: ease(window.clamp(localTime / 0.6, 0, 1), eo),
        transform: `translateY(${(1 - ease(window.clamp(localTime / 0.6, 0, 1), eo)) * 40}px)`,
      }}>
        {/* titanium inner ring */}
        <div style={{
          position: 'absolute', inset: 4,
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 60,
          pointerEvents: 'none',
        }} />
        {/* side buttons */}
        <div style={{ position: 'absolute', left: -2, top: 110, width: 3, height: 32, borderRadius: 2, background: 'linear-gradient(90deg,#1a1a1c,#2b2b2d)' }}/>
        <div style={{ position: 'absolute', left: -2, top: 172, width: 3, height: 56, borderRadius: 2, background: 'linear-gradient(90deg,#1a1a1c,#2b2b2d)' }}/>
        <div style={{ position: 'absolute', left: -2, top: 244, width: 3, height: 56, borderRadius: 2, background: 'linear-gradient(90deg,#1a1a1c,#2b2b2d)' }}/>
        <div style={{ position: 'absolute', right: -2, top: 200, width: 3, height: 96, borderRadius: 2, background: 'linear-gradient(270deg,#1a1a1c,#2b2b2d)' }}/>

        {/* screen */}
        <div style={{
          width: '100%', height: '100%',
          background: '#E5DDD5',
          borderRadius: 50,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* dynamic island */}
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            width: 128, height: 38,
            background: '#000',
            borderRadius: 22,
            zIndex: 20,
            boxShadow: '0 2px 6px rgba(0,0,0,0.4) inset',
          }}>
            {/* camera dot */}
            <div style={{
              position: 'absolute', right: 14, top: 13, width: 12, height: 12,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #1d3a5c 0%, #050912 80%)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
            }} />
          </div>

          {/* status bar */}
          <div style={{
            height: 58,
            background: '#075E54',
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 32px 0',
            fontFamily: 'SF Pro Display, Inter, system-ui, sans-serif',
            fontSize: 17, fontWeight: 600,
            letterSpacing: '-0.01em',
            position: 'relative', zIndex: 5,
          }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>22:48</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* signal bars */}
              <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
                <rect x="0"  y="8" width="3" height="4"  rx="0.5" fill="#fff"/>
                <rect x="5"  y="5" width="3" height="7"  rx="0.5" fill="#fff"/>
                <rect x="10" y="2" width="3" height="10" rx="0.5" fill="#fff"/>
                <rect x="15" y="0" width="3" height="12" rx="0.5" fill="#fff" opacity="0.55"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 2 }}>5G</span>
              {/* battery */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>67</span>
                <svg width="28" height="13" viewBox="0 0 28 13" fill="none">
                  <rect x="0.5" y="0.5" width="23" height="12" rx="3" fill="none" stroke="#fff" strokeOpacity="0.7"/>
                  <rect x="24.5" y="4" width="2.2" height="5" rx="1" fill="#fff" fillOpacity="0.7"/>
                  <rect x="2" y="2" width="15" height="9" rx="1.5" fill="#fff"/>
                </svg>
              </div>
            </div>
          </div>

          {/* WhatsApp header */}
          <div style={{
            background: '#075E54',
            color: '#fff',
            padding: '8px 14px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 1px 0 rgba(0,0,0,0.10)',
            position: 'relative', zIndex: 4,
          }}>
            {/* back chevron */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {/* avatar */}
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: BRAND_BADGE,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              border: '1.5px solid rgba(255,255,255,0.20)',
              overflow: 'hidden',
              position: 'relative',
            }}>
              <GMCMark size={38} animKey={2} />
              {/* online green dot */}
              <div style={{
                position: 'absolute', right: -1, bottom: -1,
                width: 12, height: 12, borderRadius: '50%',
                background: '#25D366',
                border: '2px solid #075E54',
              }}/>
            </div>
            <div style={{ flex: 1, lineHeight: 1.2, paddingLeft: 2 }}>
              <div style={{
                fontFamily: 'SF Pro Display, Inter, system-ui, sans-serif',
                fontSize: 17, fontWeight: 600,
                letterSpacing: '-0.01em',
              }}>Mon Chantier · canal IA</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>en ligne</div>
            </div>
            {/* video + call SVG icons */}
            <div style={{ display: 'flex', gap: 18, paddingRight: 4, color: '#fff' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 3.5V7l-4 3.5z"/>
              </svg>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.27.35-.66.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
              </svg>
            </div>
          </div>

          {/* chat area */}
          <div style={{
            flex: 1,
            background: '#E5DDD5',
            padding: '16px 12px 10px',
            display: 'flex', flexDirection: 'column', gap: 10,
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* faint doodle pattern */}
            <div style={{
              position: 'absolute', inset: 0,
              opacity: 0.08,
              backgroundImage:
                `radial-gradient(circle at 15% 25%, #075E54 0 1.5px, transparent 2px),` +
                `radial-gradient(circle at 80% 60%, #075E54 0 1.5px, transparent 2px),` +
                `radial-gradient(circle at 45% 85%, #075E54 0 1.5px, transparent 2px)`,
              backgroundSize: '80px 80px, 110px 110px, 90px 90px',
              pointerEvents: 'none',
            }} />

            {/* date pill */}
            <div style={{
              alignSelf: 'center',
              background: 'rgba(225,245,254,0.92)',
              color: '#54616C',
              fontSize: 11, fontWeight: 600,
              padding: '5px 14px', borderRadius: 8,
              marginBottom: 4,
              boxShadow: '0 1px 0.5px rgba(0,0,0,0.10)',
              letterSpacing: '0.04em',
              zIndex: 1,
            }}>AUJOURD'HUI</div>

            {/* B1 in alert */}
            <div style={{
              alignSelf: 'flex-start', maxWidth: '85%',
              background: '#fff',
              borderRadius: '0 8px 8px 8px',
              padding: '8px 12px 6px',
              fontSize: 14.5, lineHeight: 1.4, color: '#1F2C34',
              boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
              opacity: b1T,
              transform: `translateY(${(1 - b1T) * -18}px) scale(${0.92 + 0.08 * b1T})`,
              transformOrigin: 'top left',
              position: 'relative', zIndex: 1,
            }}>
              {/* tail */}
              <div style={{
                position: 'absolute', top: 0, left: -7,
                width: 8, height: 13, background: '#fff',
                clipPath: 'polygon(100% 0, 100% 100%, 0 0)',
              }} />
              <div style={{ fontWeight: 700, color: C.red, marginBottom: 4 }}>⚠️ Plombier +5j détecté</div>
              <div>3 lots impactés : <b>Élec · Carrel · Peint</b></div>
              <div style={{ marginTop: 2 }}>Cascade ou détacher ?</div>
              <div style={{ fontSize: 11, color: '#667781', marginTop: 4, textAlign: 'right' }}>22:47</div>
            </div>

            {/* B2 out */}
            <div style={{
              alignSelf: 'flex-end', maxWidth: '85%',
              background: '#DCF8C6',
              borderRadius: '8px 0 8px 8px',
              padding: '8px 12px 6px',
              fontSize: 14.5, lineHeight: 1.4, color: '#1F2C34',
              fontWeight: 600,
              boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
              opacity: b2T,
              transform: `translateY(${(1 - b2T) * -18}px) scale(${0.92 + 0.08 * b2T})`,
              transformOrigin: 'top right',
              position: 'relative', zIndex: 1,
            }}>
              {/* tail */}
              <div style={{
                position: 'absolute', top: 0, right: -7,
                width: 8, height: 13, background: '#DCF8C6',
                clipPath: 'polygon(0 0, 100% 0, 0 100%)',
              }} />
              Cascade
              <span style={{ fontSize: 11, color: '#667781', marginLeft: 8, fontWeight: 400 }}>
                22:48&nbsp;<span style={{ color: '#53BDEB', fontSize: 13 }}>✓✓</span>
              </span>
            </div>

            {/* B3 in ok */}
            <div style={{
              alignSelf: 'flex-start', maxWidth: '85%',
              background: '#fff',
              borderRadius: '0 8px 8px 8px',
              padding: '8px 12px 6px',
              fontSize: 14.5, lineHeight: 1.4, color: '#1F2C34',
              boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
              opacity: b3T,
              transform: `translateY(${(1 - b3T) * -18}px) scale(${0.92 + 0.08 * b3T})`,
              transformOrigin: 'top left',
              position: 'relative', zIndex: 1,
            }}>
              <div style={{
                position: 'absolute', top: 0, left: -7,
                width: 8, height: 13, background: '#fff',
                clipPath: 'polygon(100% 0, 100% 100%, 0 0)',
              }} />
              <div style={{ fontWeight: 700, color: C.sage, marginBottom: 4 }}>✅ Planning mis à jour</div>
              <div>Carreleur notifié par WhatsApp</div>
              <div>Nouvelle réception : <b>28 juin</b></div>
              <div style={{ fontSize: 11, color: '#667781', marginTop: 4, textAlign: 'right' }}>22:48</div>
            </div>
          </div>

          {/* input bar */}
          <div style={{
            background: '#F6F6F6',
            borderTop: '1px solid #E5E5E5',
            padding: '10px 10px 22px',
            display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0,
            position: 'relative', zIndex: 4,
          }}>
            {/* emoji */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              color: '#7C8A93',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <path d="M8.5 14.5c1 1 2 1.5 3.5 1.5s2.5-.5 3.5-1.5"/>
                <circle cx="9" cy="10" r="0.6" fill="currentColor"/>
                <circle cx="15" cy="10" r="0.6" fill="currentColor"/>
              </svg>
            </div>
            {/* input */}
            <div style={{
              flex: 1,
              background: '#fff',
              border: '1px solid #E5E5E5',
              borderRadius: 22, height: 38,
              display: 'flex', alignItems: 'center',
              padding: '0 14px', gap: 8,
              color: '#9AA0A6', fontSize: 14,
            }}>
              <span style={{ flex: 1 }}>Message</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C8A93" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C8A93" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/></svg>
            </div>
            {/* mic */}
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: '#075E54', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 4px rgba(7,94,84,0.30)',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="12" rx="3"/>
                <path d="M5 11a7 7 0 0 0 14 0"/>
                <path d="M12 18v3"/>
              </svg>
            </div>
          </div>

          {/* home indicator */}
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            width: 140, height: 5, borderRadius: 3,
            background: '#1F2C34', opacity: 0.55,
          }}/>
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE 6 — Trésorerie
// ─────────────────────────────────────────────────────────────
function SceneTreso() {
  const { localTime, duration } = window.useSprite();
  const headT = ease(window.clamp(localTime / 0.5, 0, 1), eo);
  const exitT = window.clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const outOp = 1 - ease(exitT, eio);

  // chart progressive draw
  const drawT = window.clamp((localTime - 0.6) / 1.6, 0, 1);
  const eDraw = ease(drawT, eio);

  // alert appears at t=2.0
  const alertT = ease(window.clamp((localTime - 2.0) / 0.5, 0, 1), eoBack);
  // IA card slides in at t=2.5
  const cardT = ease(window.clamp((localTime - 2.5) / 0.6, 0, 1), eo);

  // curve path
  const pts = [
    [70, 267.5],[170, 201],[270, 220],[370, 258],[470, 296],
    [570, 239],[670, 277],[770, 324.5],[870, 337.8],[970, 319.75],
    [1070, 267.5],[1170, 229.5],[1270, 182],[1370, 144],
  ];
  const pathD = 'M ' + pts.map(p => p.join(',')).join(' L ');

  // For path-draw effect we use stroke-dashoffset
  const totalLen = 2200; // approx

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, opacity: outOp }}>
      <div style={{
        position: 'absolute', left: 120, top: 80,
        fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700,
        color: C.gold, letterSpacing: '0.16em', textTransform: 'uppercase',
        opacity: headT,
      }}>
        Étape 5 · gère ton budget
      </div>
      <div style={{
        position: 'absolute', left: 120, top: 118,
        fontFamily: FONT_SANS,
        fontSize: 60, fontWeight: 700,
        color: C.navy,
        letterSpacing: '-0.025em',
        opacity: headT,
        transform: `translateY(${(1 - headT) * 16}px)`,
      }}>
        Tension de trésorerie <span style={{ color: C.red }}>S9</span> détectée — corrigée avant qu'elle arrive.
      </div>

      {/* Chart */}
      <div style={{
        position: 'absolute',
        left: 120, top: 260, right: 540, bottom: 80,
        background: '#fff',
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: '20px 16px 14px',
        opacity: headT,
      }}>
        <svg viewBox="0 0 1400 460" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="treso-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1A4A7F" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#1A4A7F" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* grid */}
          <line x1="70" y1="30" x2="1370" y2="30" stroke={C.line} />
          <line x1="70" y1="125" x2="1370" y2="125" stroke={C.line} />
          <line x1="70" y1="220" x2="1370" y2="220" stroke={C.line} />
          <line x1="70" y1="315" x2="1370" y2="315" stroke={C.navy} strokeOpacity="0.30" strokeDasharray="4 4" />
          <line x1="70" y1="410" x2="1370" y2="410" stroke={C.line} />

          <g fontFamily={FONT_MONO} fontSize="14" fontWeight="600" fill={C.muted} textAnchor="end">
            <text x="58" y="35">+30k</text>
            <text x="58" y="130">+20k</text>
            <text x="58" y="225">+10k</text>
            <text x="58" y="320" fill={C.navy}>0 €</text>
            <text x="58" y="415">−10k</text>
          </g>

          {/* tension zone */}
          {alertT > 0 && (
            <>
              <rect x="770" y="30" width="200" height="380"
                    fill={C.red} fillOpacity={0.10 * alertT} rx="6" />
              <rect x="770" y="30" width="200" height="380"
                    fill="none" stroke={C.red} strokeOpacity={0.30 * alertT}
                    strokeDasharray="4 4" rx="6" />
              <text x="870" y="56" fontFamily={FONT_MONO}
                    fontSize="13" fontWeight="700"
                    fill={C.red} textAnchor="middle"
                    opacity={alertT}>ZONE DE TENSION</text>
            </>
          )}

          {/* fill */}
          <path d={pathD + ' L 1370,410 L 70,410 Z'}
                fill="url(#treso-fill)"
                opacity={eDraw * 0.9} />

          {/* main line — draw via dashoffset */}
          <path d={pathD}
                fill="none"
                stroke={C.navy}
                strokeWidth="3.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={totalLen}
                strokeDashoffset={totalLen * (1 - eDraw)} />

          {/* points (after drawn) */}
          {eDraw > 0.95 && pts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r="5"
                    fill={i === 8 ? 'transparent' : C.navy}
                    stroke="#fff" strokeWidth="2" />
          ))}

          {/* alert point at S9 */}
          {alertT > 0 && (
            <g opacity={alertT}>
              <circle cx="870" cy="337.8" r={11 + 7 * Math.abs(Math.sin(localTime * 4))}
                      fill={C.red} fillOpacity={0.20} />
              <circle cx="870" cy="337.8" r="9" fill={C.red} stroke="#fff" strokeWidth="2.5" />
              <text x="870" y="343" textAnchor="middle"
                    fontFamily={FONT_SANS} fontSize="13" fontWeight="700"
                    fill="#fff">!</text>
            </g>
          )}

          {/* X axis */}
          <g fontFamily={FONT_MONO} fontSize="13" fontWeight="600" fill={C.muted} textAnchor="middle">
            {['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12','S13','S14'].map((w, i) => (
              <text key={i} x={70 + i * 100} y="442"
                    fill={w === 'S9' ? C.red : C.muted}
                    fontWeight={w === 'S9' ? 700 : 600}>{w}</text>
            ))}
          </g>
        </svg>
      </div>

      {/* IA proposal card */}
      <div style={{
        position: 'absolute',
        right: 120, top: 280, width: 380,
        background: 'rgba(212,165,71,0.10)',
        border: `1.5px solid rgba(212,165,71,0.45)`,
        borderRadius: 18,
        padding: '26px 28px',
        display: 'flex', flexDirection: 'column', gap: 16,
        opacity: cardT,
        transform: `translateX(${(1 - cardT) * 40}px)`,
        boxShadow: cardT > 0.5 ? '0 16px 40px rgba(212,165,71,0.18)' : 'none',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: C.red, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700,
            boxShadow: '0 4px 12px rgba(199,62,47,0.30)',
          }}>⚠</div>
          <div>
            <div style={{
              fontFamily: FONT_SANS, fontSize: 20, fontWeight: 700,
              color: C.navy, letterSpacing: '-0.01em',
            }}>Tension prévue · S9</div>
            <div style={{
              fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600,
              color: C.muted, letterSpacing: '0.04em', textTransform: 'uppercase',
              marginTop: 2,
            }}>28 juin → 4 juill.</div>
          </div>
        </div>

        <div style={{
          fontFamily: FONT_MONO, fontSize: 56, fontWeight: 700,
          color: C.red, letterSpacing: '-0.025em', lineHeight: 1,
        }}>
          −2 400 <span style={{ fontSize: 28, opacity: 0.7 }}>€</span>
        </div>

        <div style={{
          background: '#fff',
          border: `1px solid rgba(212,165,71,0.30)`,
          borderRadius: 12, padding: '16px 18px',
        }}>
          <div style={{
            fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
            color: '#8A6A1F', letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 8,
          }}>✨ Proposition Pilote IA</div>
          <div style={{
            fontFamily: FONT_SANS, fontSize: 16, lineHeight: 1.4,
            color: C.body,
          }}>
            Rééchelonner <b style={{ color: C.navy, fontWeight: 700 }}>facture peinture</b>
            <br />
            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, color: C.navy }}>S10 → S11</span>
            &nbsp;· solde projeté <b style={{ color: C.sage }}>+1 200 €</b>
          </div>
        </div>

        <button style={{
          background: C.navy, color: '#fff', border: 'none',
          padding: '14px 22px', borderRadius: 11,
          fontFamily: FONT_SANS, fontSize: 16, fontWeight: 700,
          letterSpacing: '-0.005em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: '0 6px 16px rgba(26,74,127,0.30)',
          cursor: 'pointer',
        }}>
          ✓ Appliquer
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE — Compare devis
// ─────────────────────────────────────────────────────────────
function SceneDevis() {
  const { localTime, duration } = window.useSprite();
  const headT = ease(window.clamp(localTime / 0.5, 0, 1), eo);
  const exitT = window.clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const outOp = 1 - ease(exitT, eio);

  const cols = [
    {
      rank: 'Offre n°1', name: 'Aqua Bordeaux', price: '2 800',
      tone: 'sage', reco: true, badge: '★ 4.8 · 142 avis',
      lines: ['Dépose 200', 'Tuyauterie 800', 'Sanitaires 900', 'Pose 600', 'Fournitures 180'],
      delay: 0.5,
    },
    {
      rank: 'Offre n°2', name: 'Plomberie Méric', price: '4 200',
      tone: 'neutral', badge: '★ 4.4 · 68 avis',
      lines: ['Dépose 300', 'Tuyauterie 1 200', 'Sanitaires 1 350', 'Pose 900', 'Fournitures 270'],
      delay: 0.8,
    },
    {
      rank: 'Offre n°3', name: 'PB Services', price: '6 200',
      tone: 'red', badge: '★ 3.2 · 19 avis',
      lines: ['Dépose 400', 'Tuyauterie 1 600', 'Sanitaires 1 800', 'Pose 1 200', 'Fournitures 360'],
      delay: 1.1,
    },
  ];

  // savings band appears at t=2.5
  const savT = ease(window.clamp((localTime - 2.5) / 0.5, 0, 1), eoBack);
  const savingsCount = Math.round(1400 * ease(window.clamp((localTime - 2.6) / 0.8, 0, 1), eo));

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, opacity: outOp }}>

      <div style={{
        position: 'absolute', left: 120, top: 80,
        fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700,
        color: C.gold, letterSpacing: '0.16em', textTransform: 'uppercase',
        opacity: headT,
      }}>
        Étape 3 · compare tes devis
      </div>
      <div style={{
        position: 'absolute', left: 120, top: 118,
        fontFamily: FONT_SANS, fontSize: 60, fontWeight: 700,
        color: C.navy, letterSpacing: '-0.025em',
        opacity: headT,
        transform: `translateY(${(1 - headT) * 16}px)`,
      }}>
        Compare tes devis. Choisis le bon — <span style={{ color: BRAND_ORANGE }}>pas le moins cher</span>.
      </div>

      {/* 3 cols */}
      <div style={{
        position: 'absolute', left: 120, right: 120, top: 270, bottom: 200,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24,
      }}>
        {cols.map((c, i) => {
          const t = window.clamp((localTime - c.delay) / 0.55, 0, 1);
          const e = ease(t, eoBack);
          const isReco = c.reco;
          const isRed = c.tone === 'red';
          return (
            <div key={i} style={{
              background: '#fff',
              border: isReco ? `2px solid ${C.sage}` : `1px solid ${C.line}`,
              borderRadius: 18,
              padding: '24px 26px',
              display: 'flex', flexDirection: 'column', gap: 14,
              opacity: window.clamp(t * 2, 0, 1),
              transform: `translateY(${(1 - e) * 40}px) scale(${0.92 + 0.08 * e})`,
              boxShadow: isReco
                ? `0 16px 36px rgba(58,138,101,0.22), 0 0 0 6px rgba(58,138,101,0.08)`
                : '0 8px 24px rgba(26,74,127,0.08)',
              position: 'relative',
            }}>
              {isReco && (
                <div style={{
                  position: 'absolute', top: -16, left: '50%',
                  transform: 'translateX(-50%)',
                  background: C.sage, color: '#fff',
                  padding: '7px 16px', borderRadius: 999,
                  fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.10em', textTransform: 'uppercase',
                  boxShadow: '0 4px 12px rgba(58,138,101,0.30)',
                  whiteSpace: 'nowrap',
                }}>✓ Recommandé Pilote IA</div>
              )}

              <div style={{
                fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700,
                color: isReco ? C.sage : C.muted,
                letterSpacing: '0.10em', textTransform: 'uppercase',
              }}>{c.rank}</div>

              <div style={{
                fontFamily: FONT_SANS, fontSize: 26, fontWeight: 700,
                color: C.navy, letterSpacing: '-0.015em', lineHeight: 1.1,
              }}>{c.name}</div>

              <div style={{
                fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600,
                color: C.muted, letterSpacing: '0.04em',
              }}>{c.badge}</div>

              <div style={{
                fontFamily: FONT_MONO, fontSize: 64, fontWeight: 700,
                color: isReco ? C.sage : isRed ? C.red : C.body,
                letterSpacing: '-0.03em', lineHeight: 1,
                paddingBottom: 10, borderBottom: `2px solid ${C.line}`,
              }}>
                {c.price}<span style={{ fontSize: 30, opacity: 0.7, marginLeft: 4 }}>€</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {c.lines.map((line, j) => (
                  <div key={j} style={{
                    fontFamily: FONT_MONO, fontSize: 14, fontWeight: 500,
                    color: isRed ? C.red : C.body,
                    display: 'flex', justifyContent: 'space-between',
                    paddingBottom: 4,
                    borderBottom: `1px dashed ${C.line}`,
                  }}>
                    <span>{line.split(' ').slice(0, -1).join(' ')}</span>
                    <b style={{ fontWeight: 700 }}>{line.split(' ').slice(-1)[0]} €</b>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Savings band */}
      <div style={{
        position: 'absolute',
        left: 120, right: 120, bottom: 80,
        background: 'linear-gradient(90deg, #FBF4E2 0%, #FFFAEC 100%)',
        border: `1.5px solid rgba(212,165,71,0.45)`,
        borderRadius: 16,
        padding: '20px 28px',
        display: 'flex', alignItems: 'center', gap: 24,
        opacity: savT,
        transform: `translateY(${(1 - savT) * 24}px) scale(${0.96 + 0.04 * savT})`,
        boxShadow: '0 12px 32px rgba(212,165,71,0.18)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: C.gold, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 700,
          boxShadow: '0 6px 14px rgba(212,165,71,0.30)',
          flexShrink: 0,
        }}>€</div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700,
            color: '#8A6A1F', letterSpacing: '0.10em', textTransform: 'uppercase',
            marginBottom: 4,
          }}>Économie en choisissant Aqua Bordeaux</div>
          <div style={{
            fontFamily: FONT_SANS, fontSize: 22, fontWeight: 600,
            color: C.navy, letterSpacing: '-0.01em',
          }}>3 devis comparés en 4 secondes · garanties équivalentes</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600,
            color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase',
            marginBottom: 2,
          }}>vs Méric</div>
          <div style={{
            fontFamily: FONT_MONO, fontSize: 48, fontWeight: 700,
            color: C.sage, letterSpacing: '-0.025em', lineHeight: 1,
          }}>− {savingsCount.toLocaleString('fr-FR')} <span style={{ fontSize: 24, opacity: 0.7 }}>€</span></div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE — Aides (MPR + CEE + Éco-PTZ)
// ─────────────────────────────────────────────────────────────
function SceneAides() {
  const { localTime, duration } = window.useSprite();
  const headT = ease(window.clamp(localTime / 0.5, 0, 1), eo);
  const exitT = window.clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const outOp = 1 - ease(exitT, eio);

  const aides = [
    { name: 'MaPrimeRénov\'',           sub: 'ANAH · versement 6 sem.',     amt: 2200, delay: 0.6, color: C.navy },
    { name: 'CEE — Coup de pouce', sub: 'Obligé · TotalEnergies',      amt: 800,  delay: 1.0, color: C.sage },
    { name: 'Éco-PTZ · taux 0 %',  sub: 'Banque partenaire · 7 ans',   amt: 1500, delay: 1.4, color: C.gold },
  ];

  const totalT = ease(window.clamp((localTime - 2.4) / 0.6, 0, 1), eoBack);
  const totalCount = Math.round(4500 * ease(window.clamp((localTime - 2.6) / 0.8, 0, 1), eo));

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, opacity: outOp }}>

      <div style={{
        position: 'absolute', left: 120, top: 80,
        fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700,
        color: C.gold, letterSpacing: '0.16em', textTransform: 'uppercase',
        opacity: headT,
      }}>
        Étape 2 · affine ton budget
      </div>
      <div style={{
        position: 'absolute', left: 120, top: 118, right: 120,
        fontFamily: FONT_SANS, fontSize: 60, fontWeight: 700,
        color: C.navy, letterSpacing: '-0.025em', lineHeight: 1.1,
        opacity: headT,
        transform: `translateY(${(1 - headT) * 16}px)`,
      }}>
        Affine ton budget : <span style={{ color: BRAND_ORANGE }}>MPR + CEE + Éco-PTZ</span>,
        <br/>cumulés automatiquement.
      </div>

      {/* Left : 3 aides cards */}
      <div style={{
        position: 'absolute', left: 120, top: 290, width: 880,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {aides.map((a, i) => {
          const t = window.clamp((localTime - a.delay) / 0.55, 0, 1);
          const e = ease(t, eoBack);
          const amount = Math.round(a.amt * ease(window.clamp((localTime - a.delay - 0.25) / 0.6, 0, 1), eo));
          return (
            <div key={i} style={{
              background: '#fff',
              border: `1px solid ${C.line}`,
              borderLeft: `5px solid ${a.color}`,
              borderRadius: 14,
              padding: '22px 28px',
              display: 'flex', alignItems: 'center', gap: 22,
              opacity: window.clamp(t * 2, 0, 1),
              transform: `translateX(${(1 - e) * -40}px)`,
              boxShadow: '0 8px 20px rgba(26,74,127,0.06)',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: a.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 700, flexShrink: 0,
              }}>+</div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: FONT_SANS, fontSize: 26, fontWeight: 700,
                  color: C.navy, letterSpacing: '-0.01em',
                }}>{a.name}</div>
                <div style={{
                  fontFamily: FONT_MONO, fontSize: 14, fontWeight: 500,
                  color: C.muted, marginTop: 4, letterSpacing: '0.02em',
                }}>{a.sub}</div>
              </div>
              <div style={{
                fontFamily: FONT_MONO, fontSize: 44, fontWeight: 700,
                color: a.color, letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {amount.toLocaleString('fr-FR')}<span style={{ fontSize: 24, opacity: 0.7, marginLeft: 4 }}>€</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right : Total card */}
      <div style={{
        position: 'absolute', right: 120, top: 290, width: 700,
        background: 'linear-gradient(180deg, #FBF4E2 0%, #FFFAEC 60%, #fff 100%)',
        border: `2px solid rgba(212,165,71,0.55)`,
        borderRadius: 22,
        padding: '36px 40px',
        display: 'flex', flexDirection: 'column', gap: 18,
        opacity: totalT,
        transform: `scale(${0.88 + 0.12 * totalT})`,
        transformOrigin: 'center',
        boxShadow: '0 20px 50px rgba(212,165,71,0.25)',
      }}>
        <div style={{
          fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700,
          color: '#8A6A1F', letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>Total cumulé · 30 s de simulation</div>

        <div style={{
          fontFamily: FONT_MONO, fontSize: 156, fontWeight: 700,
          color: C.gold, letterSpacing: '-0.04em', lineHeight: 1,
        }}>
          {totalCount.toLocaleString('fr-FR')}<span style={{ fontSize: 76, opacity: 0.7, marginLeft: 6 }}>€</span>
        </div>

        <div style={{
          fontFamily: FONT_SANS, fontSize: 22, fontWeight: 500,
          color: C.body, letterSpacing: '-0.005em', lineHeight: 1.4,
        }}>
          soit <b style={{ color: C.navy, fontWeight: 700 }}>35,2 %</b> du coût HT
          — importés direct dans le plan de financement.
        </div>

        <button style={{
          marginTop: 10,
          background: C.navy, color: '#fff', border: 'none',
          padding: '18px 24px', borderRadius: 12,
          fontFamily: FONT_SANS, fontSize: 18, fontWeight: 700,
          letterSpacing: '-0.005em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          cursor: 'pointer',
          boxShadow: '0 10px 24px rgba(26,74,127,0.30)',
        }}>
          Importer dans le plan de financement  →
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE — Journal IA horodaté
// ─────────────────────────────────────────────────────────────
function SceneJournal() {
  const { localTime, duration } = window.useSprite();
  const headT = ease(window.clamp(localTime / 0.5, 0, 1), eo);
  const exitT = window.clamp((localTime - (duration - 0.6)) / 0.6, 0, 1);
  const outOp = 1 - ease(exitT, eio);

  const events = [
    { date: '18 mai', time: '22:47', tone: 'warn',  glyph: '⚠', tag: 'Alerte',  text: 'Plombier annonce ', mono: '+5 jours', textEnd: ' sur le lot SDB.', delay: 0.5 },
    { date: '18 mai', time: '22:48', tone: 'ok',    glyph: '✓', tag: 'Validé',  text: 'Cascade validée par Marc en ', mono: '1 min', textEnd: '.', delay: 0.9 },
    { date: '19 mai', time: '09:12', tone: 'ok',    glyph: '✉', tag: 'WhatsApp', text: 'Carreleur notifié — réception au ', mono: '28 juin', textEnd: '.', delay: 1.3 },
    { date: '22 mai', time: '08:30', tone: 'warn',  glyph: '⚠', tag: 'Alerte',  text: 'Tension S9 prévue : ', mono: '−2 400 €', textEnd: '. IA propose rééchelonnement.', delay: 1.7 },
    { date: '23 mai', time: '08:00', tone: 'money', glyph: '€', tag: 'Argent',  text: 'MaPrimeRénov\' versée : ', mono: '+4 500 €', textEnd: '. Plan de finance à l\'équilibre.', delay: 2.1 },
  ];

  const toneMap = {
    warn:  { border: C.red,  bg: 'rgba(199,62,47,0.10)',  tagBg: 'rgba(199,62,47,0.10)',  tagBorder: 'rgba(199,62,47,0.30)',  tagColor: C.red,    monoColor: C.red },
    ok:    { border: C.sage, bg: 'rgba(58,138,101,0.10)', tagBg: 'rgba(58,138,101,0.10)', tagBorder: 'rgba(58,138,101,0.30)', tagColor: C.sage,   monoColor: C.sage },
    money: { border: C.gold, bg: 'rgba(212,165,71,0.12)', tagBg: 'rgba(212,165,71,0.12)', tagBorder: 'rgba(212,165,71,0.40)', tagColor: '#8A6A1F',monoColor: C.gold },
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.cream, opacity: outOp }}>

      <div style={{
        position: 'absolute', left: 120, top: 80,
        fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700,
        color: C.gold, letterSpacing: '0.16em', textTransform: 'uppercase',
        opacity: headT,
      }}>
        Et la preuve&nbsp;? — Journal IA horodaté
      </div>
      <div style={{
        position: 'absolute', left: 120, top: 118, right: 120,
        fontFamily: FONT_SANS, fontSize: 60, fontWeight: 700,
        color: C.navy, letterSpacing: '-0.025em', lineHeight: 1.1,
        opacity: headT,
        transform: `translateY(${(1 - headT) * 16}px)`,
      }}>
        Chaque décision, <span style={{ color: BRAND_ORANGE }}>tracée à la seconde</span>.
      </div>
      <div style={{
        position: 'absolute', left: 120, top: 218,
        fontFamily: FONT_MONO, fontSize: 18, fontWeight: 500,
        color: C.muted,
        opacity: headT,
      }}>
        Plus d'engueulade en bas du chantier · qui a dit quoi, quand, et combien.
      </div>

      {/* Timeline column */}
      <div style={{
        position: 'absolute',
        left: 240, right: 240, top: 290, bottom: 80,
        paddingLeft: 60,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'absolute',
      }}>
        {/* central vertical line */}
        <div style={{
          position: 'absolute',
          left: 11, top: 18, bottom: 18,
          width: 2,
          background: `linear-gradient(180deg, rgba(26,74,127,0.10) 0%, ${C.navy} 8%, ${C.navy} 92%, rgba(26,74,127,0.10) 100%)`,
        }} />

        {events.map((ev, i) => {
          const t = window.clamp((localTime - ev.delay) / 0.55, 0, 1);
          const e = ease(t, eoBack);
          const tone = toneMap[ev.tone];
          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '110px 1fr auto',
              alignItems: 'center',
              gap: 24,
              padding: '14px 22px',
              background: '#fff',
              border: `1px solid ${C.line}`,
              borderLeft: `5px solid ${tone.border}`,
              borderRadius: 12,
              boxShadow: '0 6px 16px rgba(26,74,127,0.06)',
              position: 'relative',
              opacity: window.clamp(t * 2, 0, 1),
              transform: `translateX(${(1 - e) * -48}px)`,
            }}>
              {/* timeline dot */}
              <div style={{
                position: 'absolute',
                left: -50, top: '50%', transform: 'translateY(-50%)',
                width: 26, height: 26, borderRadius: '50%',
                background: tone.bg,
                border: `2.5px solid ${tone.border}`,
                boxShadow: '0 0 0 4px #F5F1E8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700,
                color: tone.border,
                zIndex: 2,
              }}>
                {ev.glyph}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{
                  fontFamily: FONT_MONO, fontSize: 17, fontWeight: 700,
                  color: C.navy, letterSpacing: '-0.005em',
                }}>{ev.date}</span>
                <span style={{
                  fontFamily: FONT_MONO, fontSize: 14, fontWeight: 500,
                  color: C.muted, letterSpacing: '0.02em',
                }}>{ev.time}</span>
              </div>

              <div style={{
                fontFamily: FONT_SANS, fontSize: 20, fontWeight: 500,
                color: C.body, lineHeight: 1.35,
              }}>
                {ev.text}
                <b style={{
                  fontFamily: FONT_MONO, fontWeight: 700,
                  color: tone.monoColor,
                }}>{ev.mono}</b>
                {ev.textEnd}
              </div>

              <span style={{
                padding: '5px 12px',
                borderRadius: 999,
                background: tone.tagBg,
                border: `1px solid ${tone.tagBorder}`,
                color: tone.tagColor,
                fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>{ev.tag}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCENE 7 — Outro / CTA
// ─────────────────────────────────────────────────────────────
function SceneOutro() {
  const { localTime, duration } = window.useSprite();

  const t1 = ease(window.clamp(localTime / 0.6, 0, 1), eo);
  const t2 = ease(window.clamp((localTime - 0.6) / 0.6, 0, 1), eo);
  const t3 = ease(window.clamp((localTime - 1.2) / 0.6, 0, 1), eo);
  const t4 = ease(window.clamp((localTime - 1.8) / 0.6, 0, 1), eoBack);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `linear-gradient(135deg, ${C.navy} 0%, #0F2F5C 100%)`,
    }}>
      {/* radial glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 70% 30%, rgba(212,165,71,0.25) 0%, transparent 50%)`,
      }} />

      <div style={{
        position: 'absolute', left: 0, right: 0, top: 220,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
      }}>
        {/* GMC logo on dark */}
        <div style={{
          opacity: t1,
          transform: `scale(${0.7 + 0.3 * ease(t1, eoBack)})`,
        }}>
          <GMCLogo markSize={108} fontSize={52} color="#fff"
                   subColor="rgba(255,255,255,0.55)" sub="Pilote ton chantier au millimètre" dark />
        </div>

        <div style={{
          fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700,
          color: C.gold, letterSpacing: '0.18em', textTransform: 'uppercase',
          opacity: t2, transform: `translateY(${(1 - t2) * 12}px)`,
          marginTop: 8,
        }}>
          gerermonchantier.fr
        </div>

        <div style={{
          fontFamily: FONT_SANS, fontSize: 132, fontWeight: 700,
          color: '#fff', letterSpacing: '-0.035em', lineHeight: 1.0,
          textAlign: 'center',
          opacity: t2, transform: `translateY(${(1 - t2) * 20}px)`,
        }}>
          Pilote ton chantier<br />
          <span style={{ color: BRAND_ORANGE }}>au millimètre.</span>
        </div>

        <div style={{
          fontFamily: FONT_SANS, fontSize: 28, fontWeight: 400,
          color: 'rgba(255,255,255,0.75)',
          textAlign: 'center', maxWidth: 1100,
          letterSpacing: '-0.005em',
          marginTop: 10,
          opacity: t3, transform: `translateY(${(1 - t3) * 14}px)`,
          lineHeight: 1.45,
        }}>
          Pilote IA actif 24/7 · canal WhatsApp · cascade auto · cashflow prédictif ·
          comparateur de devis · journal horodaté · réception PV PDF.
        </div>

        <div style={{
          marginTop: 28,
          display: 'flex', alignItems: 'center', gap: 18,
          opacity: t4, transform: `scale(${0.85 + 0.15 * t4})`,
        }}>
          <div style={{
            background: BRAND_ORANGE, color: '#fff',
            padding: '22px 40px', borderRadius: 14,
            fontFamily: FONT_SANS, fontSize: 26, fontWeight: 700,
            letterSpacing: '-0.005em',
            boxShadow: '0 16px 40px rgba(245,138,6,0.45)',
          }}>
            gerermonchantier.fr
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
function Video() {
  // Scene durations
  const T1 = 3.5;   // Title
  const T2 = 4.5;   // Problem
  const T3 = 5.5;   // Hub
  const T4 = 5.5;   // Aides
  const T5 = 5.5;   // Devis
  const T6 = 5.5;   // Planning
  const T7 = 5.0;   // Trésorerie
  const T8 = 5.5;   // WhatsApp
  const T9 = 5.5;   // Journal
  const T10 = 4.5;  // Outro
  const TOTAL = T1 + T2 + T3 + T4 + T5 + T6 + T7 + T8 + T9 + T10;  // ≈ 50s

  const s1  = 0;
  const s2  = s1 + T1;
  const s3  = s2 + T2;
  const s4  = s3 + T3;
  const s5  = s4 + T4;
  const s6  = s5 + T5;
  const s7  = s6 + T6;
  const s8  = s7 + T7;
  const s9  = s8 + T8;
  const s10 = s9 + T9;
  const end = s10 + T10;

  return (
    <window.Stage
      width={1920}
      height={1080}
      duration={TOTAL}
      background={C.cream}
      persistKey="gmc-video"
      loop={true}
    >
      <window.Sprite start={s1}  end={s2}><SceneTitle /></window.Sprite>
      <window.Sprite start={s2}  end={s3}><SceneProblem /></window.Sprite>
      <window.Sprite start={s3}  end={s4}><SceneHub /></window.Sprite>
      <window.Sprite start={s4}  end={s5}><SceneAides /></window.Sprite>
      <window.Sprite start={s5}  end={s6}><SceneDevis /></window.Sprite>
      <window.Sprite start={s6}  end={s7}><SceneGantt /></window.Sprite>
      <window.Sprite start={s7}  end={s8}><SceneTreso /></window.Sprite>
      <window.Sprite start={s8}  end={s9}><SceneWhatsApp /></window.Sprite>
      <window.Sprite start={s9}  end={s10}><SceneJournal /></window.Sprite>
      <window.Sprite start={s10} end={end}><SceneOutro /></window.Sprite>
    </window.Stage>
  );
}

Object.assign(window, { Video });
