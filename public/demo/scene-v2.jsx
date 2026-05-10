// scene-v2.jsx — VARIATION 2: "Tour cockpit"
// UI-first: phone frame in the middle, screens swap with kinetic captions.
// 60s total.

// DigestLine and msgIn live in scene-v1.jsx and are exposed via window.
// Babel-standalone wraps each script in an IIFE; pulling them into local
// scope here lets the JSX references in this file resolve cleanly.
const DigestLine = window.DigestLine;
const msgIn = window.msgIn;

function SceneV2({ w = 1920, h = 1080 }) {
  const time = useTime();
  const isPortrait = h > w;
  const isSquare = Math.abs(w - h) < 50;
  const cx = w / 2,cy = h / 2;
  const ts = isPortrait ? 0.85 : 1;

  // Phone frame fixed size — fits in any aspect
  const phoneW = isPortrait ? Math.min(420, w * 0.62) : 340;
  const phoneH = phoneW * (760 / 360);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: COL.page,
      fontFamily: FONT,
      overflow: 'hidden'
    }}>
      {/* Background blob */}
      <div style={{
        position: 'absolute',
        left: '-15%', top: '-30%',
        width: '70%', height: '70%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, #DBE6FF 0%, rgba(219,230,255,0) 70%)',
        opacity: 0.55
      }} />

      {/* ─── 0–4s · Title intro with GMC logo lockup ─── */}
      <Sprite start={0.1} end={4}>
        {({ localTime }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.4, 1));
          const out = Math.max(0, 1 - Math.max(0, localTime - 3) / 0.8);
          const logoT = Easing.easeOutBack(Math.min(localTime / 0.5, 1));
          return (
            <div style={{
              position: 'absolute', left: cx, top: cy,
              transform: 'translate(-50%, -50%)',
              opacity: o * out,
              textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18
            }}>
              <GMCLogoLockup size={ts} t={localTime} />
              <div style={{
                fontSize: 84 * ts, fontWeight: 700,
                letterSpacing: '-0.025em', color: COL.text,
                lineHeight: 1.05
              }}>Gérer Mon Chantier.</div>
              <div style={{
                fontSize: 22 * ts, color: COL.muted, fontWeight: 500
              }}>Votre chantier piloté au millimètre.</div>
            </div>);

        }}
      </Sprite>

      {/* ─── 4–31s · Phone frame stays mounted, screens swap ─── */}
      <Sprite start={4} end={31} keepMounted>
        {({ localTime }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.7, 1));
          const out = Math.max(0, 1 - Math.max(0, localTime - 25.5) / 0.6);
          // Phone position: center on portrait, left on landscape
          const phoneX = isPortrait ? cx : w * 0.32;
          const phoneY = isPortrait ? cy * 0.82 : cy;
          return (
            <div style={{
              position: 'absolute',
              left: phoneX, top: phoneY,
              transform: 'translate(-50%, -50%)',
              opacity: o * out
            }}>
              <PhoneFrame width={phoneW} height={phoneH}>
                <PhoneScreens t={localTime} />
              </PhoneFrame>
            </div>);

        }}
      </Sprite>

      {/* ─── Side captions per phase ─── */}
      {!isPortrait &&
      <>
          <SideCaption start={4.2} end={9.2} ts={ts} pos={{ x: w * 0.66, y: cy }}
        eyebrow="① Tableau de bord"
        title="Tout votre chantier sur un écran."
        body="Lots, devis, factures, budget : tout se met à jour à chaque action." />
          <SideCaption start={9.3} end={14.3} ts={ts} pos={{ x: w * 0.66, y: cy }}
        eyebrow="② Pilote de chantier · IA"
        title="L'IA orchestre tout."
        body="Photos, devis, factures, messages WhatsApp : analysés et classés automatiquement." />
          <SideCaption start={14.4} end={19.4} ts={ts} pos={{ x: w * 0.66, y: cy }}
        eyebrow="③ Budget temps réel"
        title="Au centime, au jour le jour."
        body="Un message WhatsApp arrive, le Gantt se décale tout seul. Vous n’écrivez plus rien." />
          <SideCaption start={19.5} end={25} ts={ts} pos={{ x: w * 0.66, y: cy }}
        eyebrow="④ Planning vivant"
        title="Suivez le planning au jour le jour."
        body="Un message WhatsApp arrive, le planning se décale seul. Les artisans impactés sont automatiquement notifiés. Vous n’écrivez plus rien." />
          <SideCaption start={25.1} end={30.5} ts={ts} pos={{ x: w * 0.66, y: cy }}
        eyebrow="⑤ WhatsApp · Documents"
        title="Centralisé. Toujours."
        body="Vos artisans envoient sur WhatsApp, le cockpit classe — automatiquement." />
        </>
      }

      {isPortrait &&
      <>
          <PortraitCaption start={4.2} end={9.2} ts={ts} y={h * 0.06} eyebrow="① Tableau de bord" title="Tout sur un écran." />
          <PortraitCaption start={9.3} end={14.3} ts={ts} y={h * 0.06} eyebrow="② Pilote IA" title="L'IA orchestre tout." />
          <PortraitCaption start={14.4} end={19.4} ts={ts} y={h * 0.06} eyebrow="③ Budget temps réel" title="Au centime près." />
          <PortraitCaption start={19.5} end={25} ts={ts} y={h * 0.06} eyebrow="④ Planning vivant" title="Le Gantt se décale tout seul." />
          <PortraitCaption start={25.1} end={30.5} ts={ts} y={h * 0.06} eyebrow="⑤ WhatsApp · Documents" title="Centralisé." />
        </>
      }

      {/* ─── 31–40s · CTA ─── */}
      <Sprite start={31} end={40}>
        {({ localTime }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.5, 1));
          const logoT = Easing.easeOutBack(Math.min(localTime / 0.6, 1));
          return (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 22,
              opacity: o,
              background: 'linear-gradient(135deg, #1B3FA1 0%, #15307A 100%)'
            }}>
              <div style={{
                position: 'absolute', left: '-10%', top: '-10%',
                width: '40%', height: '40%', borderRadius: '50%',
                background: '#fff', opacity: 0.06, filter: 'blur(40px)'
              }} />
              <div style={{
                transform: `scale(${0.7 + 0.3 * logoT})`,
                opacity: logoT
              }}>
                <GMCLogoLockup size={ts * 1.4} t={localTime} darkMode />
              </div>
              <div style={{
                fontSize: 84 * ts, fontWeight: 700,
                letterSpacing: '-0.025em', color: '#fff',
                lineHeight: 1.05, textAlign: 'center',
                padding: '0 6%'
              }}>
                Votre chantier piloté<br />au millimètre.
              </div>
            </div>);

        }}
      </Sprite>
    </div>);

}

// ───── GMC logo lockup — official mark (blue rounded square + house with
// orange roof, "Gérer Mon Chantier" wordmark with orange "Mon", PILOTE IA
// DE CHANTIER sub-label) ─────
function GMCLogoLockup({ size = 1, t = 0, darkMode = false, iconOnly = false }) {
  const s = size;
  const bob = Math.sin(t * 1.2) * 2;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 14 * s,
      fontFamily: FONT
    }}>
      <GMCMark size={56 * s} bob={bob} />
      {!iconOnly &&
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 * s }}>
          <div style={{
          fontSize: 26 * s, fontWeight: 700,
          letterSpacing: '-0.015em', lineHeight: 1,
          color: darkMode ? '#fff' : COL.text,
          whiteSpace: 'nowrap'
        }}>
            Gérer<span style={{ color: '#F58A06' }}>Mon</span>Chantier
          </div>
          <span style={{
          fontSize: 9 * s, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: darkMode ? 'rgba(255,255,255,0.65)' : COL.muted,
          lineHeight: 1
        }}>Pilote IA de chantier</span>
        </div>
      }
    </div>);

}

function GMCMark({ size = 56, bob = 0 }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" style={{
      transform: `translateY(${bob}px)`,
      filter: 'drop-shadow(0 4px 10px rgba(27,63,161,0.25))'
    }}>
      {/* Blue rounded square */}
      <rect x="0" y="0" width="64" height="64" rx="14" fill="#1B3FA1" />
      {/* House body (white) */}
      <path d="M16 30 L32 18 L48 30 L48 50 L16 50 Z" fill="#FFFFFF" />
      {/* Roof (orange) — sloped triangle on top */}
      <path d="M14 32 L32 17 L50 32 L46 35 L32 23 L18 35 Z" fill="#F58A06" />
      {/* Chimney (orange) */}
      <rect x="40" y="20" width="4" height="8" fill="#F58A06" />
      {/* Door (blue) */}
      <rect x="28" y="38" width="8" height="12" rx="1" fill="#1B3FA1" />
    </svg>);

}

// ── Side caption block (paired with phone) ───────────────────────────
function SideCaption({ start, end, ts, pos, eyebrow, title, body }) {
  return (
    <Sprite start={start} end={end}>
      {({ localTime, duration }) => {
        const o = Easing.easeOutCubic(Math.min(localTime / 0.5, 1));
        const out = Math.max(0, 1 - Math.max(0, localTime - (duration - 0.6)) / 0.6);
        return (
          <div style={{
            position: 'absolute',
            left: pos.x, top: pos.y,
            transform: `translate(-50%, -50%) translateX(${(1 - o) * 24}px)`,
            opacity: o * out,
            maxWidth: 540,
            width: 'min(38vw, 540px)'
          }}>
            <Eyebrow color={COL.cockpitBlue} style={{ display: 'block', marginBottom: 14 }}>
              {eyebrow}
            </Eyebrow>
            <div style={{
              fontSize: 56 * ts, fontWeight: 700,
              letterSpacing: '-0.02em', color: COL.text,
              lineHeight: 1.05, marginBottom: 18
            }}>{title}</div>
            <div style={{
              fontSize: 20 * ts, color: COL.muted,
              lineHeight: 1.5
            }}>{body}</div>
          </div>);

      }}
    </Sprite>);

}

function PortraitCaption({ start, end, ts, y, eyebrow, title }) {
  return (
    <Sprite start={start} end={end}>
      {({ localTime, duration }) => {
        const o = Easing.easeOutCubic(Math.min(localTime / 0.4, 1));
        const out = Math.max(0, 1 - Math.max(0, localTime - (duration - 0.5)) / 0.5);
        return (
          <div style={{
            position: 'absolute',
            left: '50%', top: y,
            transform: `translateX(-50%) translateY(${(1 - o) * 12}px)`,
            opacity: o * out,
            textAlign: 'center',
            padding: '0 6%'
          }}>
            <Eyebrow color={COL.cockpitBlue} style={{ display: 'block', marginBottom: 10 }}>
              {eyebrow}
            </Eyebrow>
            <div style={{
              fontSize: 44 * ts, fontWeight: 700,
              letterSpacing: '-0.02em', color: COL.text,
              lineHeight: 1.1
            }}>{title}</div>
          </div>);

      }}
    </Sprite>);

}

// ── Inner phone screens (swap based on time) ────────────────────────
function PhoneScreens({ t }) {
  // 5 sub-phases × 5s for snappy rhythm. Total 25s of screens.
  const phases = [
  { from: 0, to: 5, render: () => <ScreenDashboard t={t} /> },
  { from: 5, to: 10, render: () => <ScreenPiloteIA t={t - 5} /> },
  { from: 10, to: 15, render: () => <ScreenBudget t={t - 10} /> },
  { from: 15, to: 21, render: () => <ScreenPlanning t={t - 15} /> },
  { from: 21, to: 27, render: () => <ScreenMessages t={t - 21} /> }];

  return (
    <div style={{
      position: 'absolute', inset: 0,
      paddingTop: 36 // notch
    }}>
      {phases.map((p, i) => {
        if (t < p.from - 0.5 || t > p.to + 0.5) return null;
        const fadeIn = Math.max(0, Math.min(1, (t - p.from) / 0.35));
        const fadeOut = Math.max(0, Math.min(1, (p.to - t) / 0.35));
        const opacity = fadeIn * fadeOut;
        return (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            paddingTop: 36,
            opacity,
            transform: `translateY(${(1 - fadeIn) * 8}px)`,
            transition: 'none'
          }}>{p.render()}</div>);

      })}
    </div>);

}

// ── Per-screen phone content ────────────────────────────────────────
function ScreenDashboard({ t }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: COL.page,
      display: 'flex', flexDirection: 'column',
      paddingTop: 40
    }}>
      <div style={{
        background: COL.card,
        borderBottom: `1px solid ${COL.borderSoft}`,
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #EFF4FF, #DBE6FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🏠</div>
        <div>
          <div style={{ fontSize: 8, fontWeight: 700, color: COL.mutedLight, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Mon chantier</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: COL.text }}>Maison Lyon · Rénovation</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '12px 14px', background: COL.card, borderBottom: `1px solid ${COL.borderSoft}` }}>
        <KPI label="Budget" value="48k €" scale={0.85} />
        <div style={{ width: 1, background: COL.borderSoft, height: 28, alignSelf: 'center' }} />
        <KPI label="Engagé" value="31,5k €" color={COL.cockpitBlue} scale={0.85} />
        <div style={{ width: 1, background: COL.borderSoft, height: 28, alignSelf: 'center' }} />
        <KPI label="Payé" value="18,2k €" color={COL.emerald} scale={0.85} />
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <Card padding={12} scale={1} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Eyebrow style={{ display: 'block', marginBottom: 4 }}>Verdict global</Eyebrow>
            <ScorePill tone="green" scale={0.8} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: COL.cockpitBlue, fontVariantNumeric: 'tabular-nums' }}>62%</div>
        </Card>
        <BudgetBar pct={62} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
          <LotCardMini emoji="🚿" name="Salle de bain" devisCount={3} factureCount={1} refRange="8k – 12k" />
          <LotCardMini emoji="🔧" name="Plomberie" devisCount={2} factureCount={0} refRange="12k – 18k" insight={{ bg: '#FEF1E0', border: '#F58A06', text: '#92400E', icon: '⚠️', label: 'Surcoût détecté' }} />
        </div>
      </div>
    </div>);

}

function ScreenPiloteIA({ t }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, paddingTop: 40,
      background: COL.page,
      padding: '40px 14px 14px 14px',
      display: 'flex', flexDirection: 'column', gap: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <BotIcon size={18} color={COL.cockpitBlue} />
        <div style={{ fontSize: 12, fontWeight: 700, color: COL.text }}>Pilote de chantier</div>
      </div>
      <PiloteIACard scale={1} headline="3 décisions à valider" sub="J'ai analysé le devis Plomberie et planifié 2 rappels." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        <DigestLine icon="⚙️" tone="blue" label="Devis Carrelage → Salle de bain" delay={0.8} t={t} />
        <DigestLine icon="⚠️" tone="orange" label="Surcoût 1 240 € · Plomberie" delay={1.2} t={t} />
        <DigestLine icon="💬" tone="violet" label="Message de J. Mercier" delay={1.6} t={t} />
        <DigestLine icon="❓" tone="green" label="Photo joints validée" delay={2.0} t={t} />
      </div>
      {/* Typing indicator */}
      <div style={{
        marginTop: 6, padding: '8px 12px',
        background: COL.card, border: `1px solid ${COL.borderSoft}`,
        borderRadius: 14, borderBottomLeftRadius: 4,
        display: 'flex', alignItems: 'center', gap: 6,
        alignSelf: 'flex-start', opacity: Math.max(0, Math.min(1, (t - 2.5) / 0.4))
      }}>
        {[0, 1, 2].map((i) => {
          const bob = Math.sin(t * 4 + i * 0.6);
          return (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: 999,
              background: COL.cockpitBlue,
              opacity: 0.4 + 0.6 * Math.max(0, bob),
              transform: `translateY(${-bob * 2}px)`
            }} />);

        })}
      </div>
    </div>);

}

function ScreenBudget({ t }) {
  const tCount = Math.min(1, t / 1.4);
  const eased = Easing.easeOutQuart(tCount);
  return (
    <div style={{
      position: 'absolute', inset: 0, paddingTop: 40,
      background: COL.page,
      padding: '40px 14px 14px 14px',
      display: 'flex', flexDirection: 'column', gap: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <WalletIcon size={18} color={COL.cockpitBlue} />
        <div style={{ fontSize: 12, fontWeight: 700, color: COL.text }}>Budget · cashflow</div>
      </div>
      <Card padding={14} scale={1}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <KPI label="Budget" value={`${Math.round(48 * eased)}k €`} scale={0.95} />
          <KPI label="Engagé" value={`${(31.5 * eased).toFixed(1).replace('.', ',')}k €`} color={COL.cockpitBlue} scale={0.95} />
          <KPI label="Payé" value={`${(18.2 * eased).toFixed(1).replace('.', ',')}k €`} color={COL.emerald} scale={0.95} />
        </div>
        <div style={{ height: 10, background: '#EEF0F4', borderRadius: 999, marginTop: 12, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${eased * 65}%`, background: COL.cockpitBlue, borderRadius: 999 }} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${eased * 38}%`, background: COL.emerald, borderRadius: 999 }} />
        </div>
        <div style={{ fontSize: 9, color: COL.muted, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>0 €</span><span style={{ fontWeight: 600 }}>62% · 38%</span><span>48 000 €</span>
        </div>
      </Card>
      {/* Mini sparkline */}
      <Card padding={12} scale={1}>
        <Eyebrow style={{ display: 'block', marginBottom: 6 }}>Cashflow · 6 mois</Eyebrow>
        <Sparkline width={280} height={64} progress={eased} />
      </Card>
      <Card padding={10} scale={1} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>⚠️</span>
        <div style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>Surcoût détecté · Plomberie · +1 240 €</div>
      </Card>
    </div>);

}

// ── Planning screen: WhatsApp msg arrives → Gantt bar shifts ──
function ScreenPlanning({ t }) {
  // 0.0 chips/header in
  // 0.6 gantt rows draw in (stagger)
  // 2.2 WA message bubble pops in
  // 2.9 highlight target row + bar shift right by Δ days, with new end marker
  // 4.2 toast "Planning mis à jour · +2 jours" appears
  const inAt = (start, dur = 0.4) => Easing.easeOutCubic(Math.max(0, Math.min(1, (t - start) / dur)));
  const rowFade = (i) => inAt(0.6 + i * 0.12, 0.35);

  const msgIn = inAt(2.2, 0.35);
  // Shift progress: ramps 2.9 → 3.6, then holds
  const shift = Easing.easeInOutCubic(Math.max(0, Math.min(1, (t - 2.9) / 0.7)));
  const toast = inAt(4.2, 0.4);

  const dayW = 18; // px per day in the mini gantt
  const rows = [
  { lot: '🧱 Maçonnerie', start: 0, len: 5, color: '#94A3B8' },
  { lot: '🔧 Plomberie', start: 4, len: 4, color: '#2563EB' }, // <-- target
  { lot: '⚡ Électricité', start: 7, len: 4, color: '#94A3B8' },
  { lot: '🚿 Carrelage', start: 10, len: 5, color: '#94A3B8' }];

  const targetIdx = 1;
  const shiftDays = 2;

  return (
    <div style={{
      position: 'absolute', inset: 0, paddingTop: 40,
      background: COL.page,
      padding: '40px 14px 14px 14px',
      display: 'flex', flexDirection: 'column', gap: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarIcon size={18} color={COL.cockpitBlue} />
        <div style={{ fontSize: 12, fontWeight: 700, color: COL.text }}>Planning · semaine 12</div>
        <span style={{
          marginLeft: 'auto', fontSize: 9, fontWeight: 700,
          color: COL.cockpitBlue, background: '#EAF1FF',
          padding: '3px 8px', borderRadius: 999,
          letterSpacing: '0.08em', textTransform: 'uppercase'
        }}>Live</span>
      </div>

      <Card padding={10} scale={1}>
        {/* Day header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '78px 1fr', alignItems: 'center',
          fontSize: 8, color: COL.mutedLight, fontWeight: 600,
          marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase'
        }}>
          <span>Lot</span>
          <div style={{ display: 'flex', gap: 0 }}>
            {['L', 'M', 'M', 'J', 'V', 'S', 'D', 'L', 'M', 'M', 'J', 'V', 'S', 'D', 'L'].map((d, i) =>
            <span key={i} style={{ width: dayW, textAlign: 'center', color: i % 7 >= 5 ? '#CBD5E1' : COL.mutedLight }}>{d}</span>
            )}
          </div>
        </div>

        {/* Gantt rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rows.map((r, i) => {
            const isTarget = i === targetIdx;
            const offset = isTarget ? shift * shiftDays * dayW : 0;
            const highlight = isTarget && t > 2.6 && t < 4.6;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '78px 1fr', alignItems: 'center',
                opacity: rowFade(i),
                transform: `translateY(${(1 - rowFade(i)) * 6}px)`,
                background: highlight ? 'rgba(37,99,235,0.06)' : 'transparent',
                borderRadius: 6,
                padding: '2px 0',
                transition: 'background 200ms ease-out'
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: COL.text, paddingLeft: 2 }}>{r.lot}</div>
                <div style={{ position: 'relative', height: 14 }}>
                  {/* Ghost (original) position — visible while shift > 0 */}
                  {isTarget && shift > 0.02 &&
                  <div style={{
                    position: 'absolute',
                    left: r.start * dayW, top: 2,
                    width: r.len * dayW, height: 10,
                    borderRadius: 5,
                    border: `1.5px dashed ${COL.cockpitBlue}`,
                    background: 'rgba(37,99,235,0.05)',
                    opacity: 0.6 * (1 - shift * 0.3)
                  }} />
                  }
                  {/* Actual bar */}
                  <div style={{
                    position: 'absolute',
                    left: r.start * dayW + offset, top: 2,
                    width: r.len * dayW, height: 10,
                    borderRadius: 5,
                    background: r.color,
                    boxShadow: isTarget ? `0 2px 8px ${r.color}55` : 'none',
                    transition: 'none'
                  }} />
                </div>
              </div>);

          })}
        </div>
      </Card>

      {/* WhatsApp message that triggers the shift */}
      <div style={{
        background: COL.card, border: `1px solid ${COL.borderSoft}`,
        borderRadius: 12, padding: '8px 10px',
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: msgIn,
        transform: `translateY(${(1 - msgIn) * 8}px)`,
        boxShadow: '0 4px 12px -4px rgba(0,0,0,0.08)'
      }}>
        <WhatsAppIcon size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#075E54', lineHeight: 1.2 }}>J. Mercier · Plomberie</div>
          <div style={{ fontSize: 10, color: COL.text, lineHeight: 1.3 }}>
            « Livraison du chauffe-eau décalée de 2 jours »
          </div>
        </div>
        <span style={{ fontSize: 8, color: COL.muted }}>09:42</span>
      </div>

      {/* Toast: planning updated */}
      <div style={{
        position: 'absolute', left: 14, right: 14, bottom: 14,
        background: '#0F766E', color: '#fff',
        borderRadius: 12, padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 8px 20px -6px rgba(15,118,110,0.45)',
        opacity: toast,
        transform: `translateY(${(1 - toast) * 14}px)`
      }}>
        <span style={{ fontSize: 14 }}>✓</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.85 }}>Planning mis à jour</div>
          <div style={{ fontSize: 10, fontWeight: 600 }}>Plomberie · +2 jours · 3 lots replanifiés</div>
        </div>
      </div>
    </div>);

}

// ── Minimal calendar icon (Lucide-style) ──
function CalendarIcon({ size = 18, color = '#1A2233' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>);

}

function ScreenMessages({ t }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, paddingTop: 40,
      background: '#ECE5DD',
      padding: '40px 12px 12px 12px',
      display: 'flex', flexDirection: 'column', gap: 6
    }}>
      <div style={{
        background: COL.card, padding: '8px 12px', borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
        border: `1px solid ${COL.borderSoft}`
      }}>
        <WhatsAppIcon size={18} />
        <div style={{ fontSize: 11, fontWeight: 700, color: COL.text }}>Canal artisans</div>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: COL.muted }}>4 connectés</span>
      </div>
      <WAMessage from="left" sender="J. Mercier" text="Photo des joints terminée 👇" time="14:32" scale={0.85} style={{ opacity: msgIn(t, 0.4) }} />
      <WAMessage from="right" text="Bien reçu, merci." time="14:34" scale={0.85} style={{ opacity: msgIn(t, 0.8) }} />
      <WAMessage from="left" sender="L. Vasseur" text="Devis peinture envoyé sur l'app." time="15:01" scale={0.85} style={{ opacity: msgIn(t, 1.2) }} />
      <WAMessage from="left" sender="Pilote IA" text="J'ai classé le devis dans Peinture · 4,2k €" time="15:01" scale={0.85} style={{ opacity: msgIn(t, 1.6) }} />
      {/* Pop-up at the end: doc classified */}
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 12,
        background: COL.card, border: `1px solid ${COL.borderSoft}`,
        borderRadius: 12, padding: 12,
        boxShadow: '0 10px 24px -8px rgba(0,0,0,0.15)',
        opacity: Math.max(0, Math.min(1, (t - 2.4) / 0.5)),
        transform: `translateY(${Math.max(0, 12 - (t - 2.4) * 24)}px)`
      }}>
        <Eyebrow color={COL.cockpitBlue} style={{ display: 'block', marginBottom: 6 }}>Document classé</Eyebrow>
        <DocRow icon="📄" name="Devis Peinture · Vasseur" kind="Devis" amount="4,2k €" scale={0.9} />
      </div>
    </div>);

}

function Sparkline({ width, height, progress }) {
  const points = [10, 22, 18, 30, 42, 38, 55];
  const max = Math.max(...points);
  const stepX = width / (points.length - 1);
  const path = points.map((p, i) => {
    const x = i * stepX;
    const y = height - p / max * (height - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
  // Draw progress: clip path to progress %
  const drawn = Math.max(0, Math.min(1, progress));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <clipPath id="spark-clip">
          <rect x="0" y="0" width={width * drawn} height={height} />
        </clipPath>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={COL.cockpitBlue} stopOpacity="0.25" />
          <stop offset="1" stopColor={COL.cockpitBlue} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath="url(#spark-clip)">
        <path d={`${path} L${width},${height} L0,${height} Z`} fill="url(#spark-fill)" />
        <path d={path} fill="none" stroke={COL.cockpitBlue} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* End dot */}
      {drawn >= 1 &&
      <circle cx={(points.length - 1) * stepX} cy={height - points[points.length - 1] / max * (height - 4) - 2} r="3.5" fill="#fff" stroke={COL.cockpitBlue} strokeWidth="2" />
      }
    </svg>);

}

Object.assign(window, { SceneV2 });