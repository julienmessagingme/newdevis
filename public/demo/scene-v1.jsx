// scene-v1.jsx — VARIATION 1: "Sérénité narrative"
// Kinetic typography first, UI fragments as subtle support.
// Calm pacing, brand-primary deep blue + slate. 60s total.

function SceneV1({ w = 1920, h = 1080 }) {
  const time = useTime();
  const isPortrait = h > w;
  const isSquare = Math.abs(w - h) < 50;
  const cx = w / 2;
  const cy = h / 2;
  // Scale type to format
  const ts = isPortrait ? 0.85 : (isSquare ? 0.9 : 1);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: COL.page,
      fontFamily: FONT,
      overflow: 'hidden',
    }}>
      {/* Background atmospheric blue blob, soft */}
      <div style={{
        position: 'absolute',
        left: '-15%', top: '-20%',
        width: '70%', height: '70%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, #DBE6FF 0%, rgba(219,230,255,0) 70%)',
        opacity: 0.55,
        filter: 'blur(20px)',
      }} />
      <div style={{
        position: 'absolute',
        right: '-10%', bottom: '-20%',
        width: '60%', height: '60%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, #E8EFFB 0%, rgba(232,239,251,0) 70%)',
        opacity: 0.7,
        filter: 'blur(20px)',
      }} />

      {/* ─── 0–6s · "Vous avez signé." ─── */}
      <Sprite start={0.3} end={6}>
        {({ progress, localTime }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.8, 1));
          const tx = (1 - o) * -20;
          const xo = localTime > 5 ? (localTime - 5) : 0;
          const outFade = Math.max(0, 1 - xo);
          return (
            <div style={{
              position: 'absolute', left: cx, top: cy,
              transform: `translate(-50%, -50%) translateX(${tx}px)`,
              opacity: o * outFade,
            }}>
              <Eyebrow color={COL.cockpitBlue} style={{ display: 'block', marginBottom: 16, textAlign: 'center' }}>
                Le chantier commence
              </Eyebrow>
              <div style={{
                fontSize: 88 * ts, fontWeight: 700,
                letterSpacing: '-0.02em', color: COL.text,
                textAlign: 'center', lineHeight: 1.05,
              }}>
                Vous avez signé.
              </div>
            </div>
          );
        }}
      </Sprite>

      {/* ─── 6–14s · "Et tout devient flou." with floating chaos icons ─── */}
      <Sprite start={6} end={14}>
        {({ localTime, progress }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.7, 1));
          const out = Math.max(0, 1 - Math.max(0, localTime - 7) / 1);
          return (
            <>
              <div style={{
                position: 'absolute', left: cx, top: cy,
                transform: `translate(-50%, -50%)`,
                opacity: o * out,
                textAlign: 'center',
              }}>
                <div style={{
                  fontSize: 64 * ts, fontWeight: 700,
                  letterSpacing: '-0.02em', color: COL.text,
                  lineHeight: 1.1,
                }}>
                  Et puis…
                </div>
                <div style={{
                  fontSize: 64 * ts, fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: COL.cockpitBlue,
                  lineHeight: 1.1, marginTop: 8,
                }}>
                  tout devient flou.
                </div>
              </div>

              {/* Floating chaos artifacts around the text */}
              {[
                { x: 0.12, y: 0.18, r: -8, content: <ChaosBubble icon="📄" label="Devis plomberie" /> },
                { x: 0.78, y: 0.22, r: 6, content: <ChaosBubble icon="💬" label="WhatsApp · J. Mercier" tone="violet" /> },
                { x: 0.08, y: 0.72, r: 4, content: <ChaosBubble icon="🧾" label="Facture peinture" tone="amber" /> },
                { x: 0.82, y: 0.74, r: -5, content: <ChaosBubble icon="📅" label="RDV mercredi 14h" /> },
                { x: 0.18, y: 0.45, r: -3, content: <ChaosBubble icon="📷" label="Photo chantier" tone="green" /> },
                { x: 0.74, y: 0.5, r: 5, content: <ChaosBubble icon="📧" label="Email artisan" /> },
              ].map((b, i) => {
                const start = 1 + i * 0.15;
                const t = Math.max(0, Math.min(1, (localTime - start) / 0.5));
                const eased = Easing.easeOutBack(t);
                const float = Math.sin((localTime - start) * 1.4) * 6;
                return (
                  <div key={i} style={{
                    position: 'absolute',
                    left: b.x * w, top: b.y * h + float,
                    transform: `translate(-50%, -50%) rotate(${b.r}deg) scale(${0.6 + 0.4 * eased})`,
                    opacity: t * out,
                  }}>{b.content}</div>
                );
              })}
            </>
          );
        }}
      </Sprite>

      {/* ─── 14–22s · "Reprenez le contrôle." ─── */}
      <Sprite start={14} end={22}>
        {({ localTime }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.8, 1));
          const out = Math.max(0, 1 - Math.max(0, localTime - 7) / 1);
          // Letters animating in
          const letters = 'Reprenez le contrôle.'.split('');
          return (
            <div style={{
              position: 'absolute', left: cx, top: cy,
              transform: 'translate(-50%, -50%)',
              opacity: out,
              textAlign: 'center',
            }}>
              <Eyebrow color={COL.cockpitBlue} style={{ display: 'block', marginBottom: 20, opacity: o }}>
                La solution
              </Eyebrow>
              <div style={{
                fontSize: 104 * ts, fontWeight: 700,
                letterSpacing: '-0.025em', color: COL.text,
                lineHeight: 1.05,
              }}>
                {letters.map((c, i) => {
                  const start = i * 0.04;
                  const t = Math.max(0, Math.min(1, (localTime - start) / 0.4));
                  const eased = Easing.easeOutCubic(t);
                  return (
                    <span key={i} style={{
                      display: 'inline-block',
                      opacity: eased,
                      transform: `translateY(${(1 - eased) * 30}px)`,
                      whiteSpace: 'pre',
                    }}>{c === ' ' ? '\u00A0' : c}</span>
                  );
                })}
              </div>
            </div>
          );
        }}
      </Sprite>

      {/* ─── 22–34s · Pilote de Chantier ─── */}
      <Sprite start={22} end={34}>
        {({ localTime }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.6, 1));
          const out = Math.max(0, 1 - Math.max(0, localTime - 11) / 1);
          return (
            <div style={{
              position: 'absolute', inset: 0,
              opacity: out,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: isPortrait ? 'column' : 'row',
              gap: isPortrait ? 40 : 80,
              padding: isPortrait ? '8% 6%' : '6%',
            }}>
              <div style={{
                opacity: o, transform: `translateX(${(1 - o) * -20}px)`,
                maxWidth: isPortrait ? '100%' : 500,
              }}>
                <Eyebrow color={COL.cockpitBlue} style={{ display: 'block', marginBottom: 14 }}>
                  Pilote de chantier · IA
                </Eyebrow>
                <div style={{
                  fontSize: 64 * ts, fontWeight: 700,
                  letterSpacing: '-0.02em', color: COL.text,
                  lineHeight: 1.05, marginBottom: 18,
                }}>Une IA<br/>orchestre tout.</div>
                <div style={{
                  fontSize: 22 * ts, color: COL.muted,
                  lineHeight: 1.45, maxWidth: 460,
                }}>
                  Vos devis, photos, factures et messages WhatsApp sont analysés et classés automatiquement.
                </div>
              </div>
              <div style={{
                opacity: Math.min(1, Math.max(0, localTime - 0.4) / 0.6),
                transform: `translateY(${Math.max(0, 20 - localTime * 30)}px)`,
                width: isPortrait ? '90%' : 460,
              }}>
                <PiloteIACard scale={1.3} headline="3 décisions à valider depuis hier" sub="J'ai analysé un nouveau devis Plomberie et planifié 2 rappels." />
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <DigestLine icon="⚙️" tone="blue"   label="Devis Carrelage classé dans Salle de bain" delay={1.2} t={localTime} />
                  <DigestLine icon="⚠️" tone="orange" label="Surcoût de 1 240 € détecté sur Plomberie"      delay={1.6} t={localTime} />
                  <DigestLine icon="💬" tone="violet" label="Message de J. Mercier reçu"                    delay={2.0} t={localTime} />
                </div>
              </div>
            </div>
          );
        }}
      </Sprite>

      {/* ─── 34–44s · Budget temps réel ─── */}
      <Sprite start={34} end={44}>
        {({ localTime }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.6, 1));
          const out = Math.max(0, 1 - Math.max(0, localTime - 9) / 1);
          // Budget numbers count up
          const tCount = Math.min(1, localTime / 1.4);
          const eased = Easing.easeOutQuart(tCount);
          const budget = Math.round(48 * eased);
          const engage = Math.round(31.5 * eased * 10) / 10;
          const paye = Math.round(18.2 * eased * 10) / 10;
          return (
            <div style={{
              position: 'absolute', inset: 0,
              opacity: out,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: isPortrait ? 'column' : 'row',
              gap: isPortrait ? 36 : 80,
              padding: '6%',
            }}>
              <div style={{
                opacity: o, transform: `translateX(${(1 - o) * -20}px)`,
                maxWidth: isPortrait ? '100%' : 500,
              }}>
                <Eyebrow color={COL.cockpitBlue} style={{ display: 'block', marginBottom: 14 }}>
                  Budget · cashflow
                </Eyebrow>
                <div style={{
                  fontSize: 64 * ts, fontWeight: 700,
                  letterSpacing: '-0.02em', color: COL.text,
                  lineHeight: 1.05, marginBottom: 18,
                }}>Au centime,<br/>au jour le jour.</div>
                <div style={{
                  fontSize: 22 * ts, color: COL.muted,
                  lineHeight: 1.45, maxWidth: 460,
                }}>
                  Engagé, payé, restant à payer : votre cashflow est mis à jour en temps réel à chaque devis et facture.
                </div>
              </div>
              <div style={{
                width: isPortrait ? '90%' : 540,
                opacity: o,
              }}>
                <Card scale={1.4} padding={24}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
                    <KPI label="Budget"  value={`${budget}k €`}            scale={1.6} color={COL.text} />
                    <KPI label="Engagé"  value={`${engage.toFixed(1).replace('.', ',')}k €`} scale={1.6} color={COL.cockpitBlue} />
                    <KPI label="Payé"    value={`${paye.toFixed(1).replace('.', ',')}k €`}    scale={1.6} color={COL.emerald} />
                  </div>
                  <div style={{ height: 14, background: '#EEF0F4', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${eased * 65}%`,
                      background: COL.cockpitBlue, borderRadius: 999,
                    }} />
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${eased * 38}%`,
                      background: COL.emerald, borderRadius: 999,
                    }} />
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 13, color: COL.muted, marginTop: 12,
                    fontFamily: FONT,
                  }}>
                    <span>0 €</span>
                    <span style={{ fontWeight: 600 }}>62% engagé · 38% payé</span>
                    <span>48 000 €</span>
                  </div>
                </Card>
              </div>
            </div>
          );
        }}
      </Sprite>

      {/* ─── 44–53s · WhatsApp + Documents ─── */}
      <Sprite start={44} end={53}>
        {({ localTime }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.6, 1));
          const out = Math.max(0, 1 - Math.max(0, localTime - 8) / 1);
          return (
            <div style={{
              position: 'absolute', inset: 0,
              opacity: out,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '6%',
              flexDirection: 'column', gap: 32,
            }}>
              <div style={{
                opacity: o, textAlign: 'center',
                transform: `translateY(${(1 - o) * 16}px)`,
              }}>
                <Eyebrow color={COL.cockpitBlue} style={{ display: 'block', marginBottom: 14 }}>
                  WhatsApp · Documents
                </Eyebrow>
                <div style={{
                  fontSize: 56 * ts, fontWeight: 700,
                  letterSpacing: '-0.02em', color: COL.text,
                  lineHeight: 1.05,
                }}>Tout est centralisé.</div>
              </div>
              <div style={{
                display: 'flex', gap: 32,
                flexDirection: isPortrait ? 'column' : 'row',
                alignItems: 'stretch', justifyContent: 'center',
                width: '100%', maxWidth: 1100,
              }}>
                <div style={{ flex: 1, maxWidth: isPortrait ? '100%' : 480, opacity: Math.min(1, Math.max(0, localTime - 0.6)) }}>
                  <Card padding={18} scale={1.3}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <WhatsAppIcon size={26} />
                      <div style={{ fontWeight: 700, fontSize: 16, color: COL.text }}>Canal artisans</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <WAMessage from="left"  sender="J. Mercier"  text="Photo des joints terminée 👇"   time="14:32" scale={1.1} style={{ opacity: msgIn(localTime, 1.0) }} />
                      <WAMessage from="right" text="Reçu, merci." time="14:34" scale={1.1} style={{ opacity: msgIn(localTime, 1.4) }} />
                      <WAMessage from="left"  sender="L. Vasseur" text="Devis peinture envoyé sur l'app." time="15:01" scale={1.1} style={{ opacity: msgIn(localTime, 1.8) }} />
                    </div>
                  </Card>
                </div>
                <div style={{ flex: 1, maxWidth: isPortrait ? '100%' : 480, opacity: Math.min(1, Math.max(0, localTime - 1.0)) }}>
                  <Card padding={18} scale={1.3}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <FolderIcon size={26} color={COL.cockpitBlue} />
                      <div style={{ fontWeight: 700, fontSize: 16, color: COL.text }}>Documents · classés</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <DocRow icon="📄" name="Devis Plomberie · Mercier"      kind="Devis"   amount="12,4k €" scale={1.1} style={{ opacity: msgIn(localTime, 1.0) }} />
                      <DocRow icon="🧾" name="Facture Carrelage · Patrick"     kind="Facture" amount="4,2k €" kindColor={COL.violet} kindBg={COL.violetBg} scale={1.1} style={{ opacity: msgIn(localTime, 1.4) }} />
                      <DocRow icon="📷" name="Photo joints · 12 mai"           kind="Photo"   kindColor={COL.emerald} kindBg={COL.emeraldBg} scale={1.1} style={{ opacity: msgIn(localTime, 1.8) }} />
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          );
        }}
      </Sprite>

      {/* ─── 53–60s · CTA ─── */}
      <Sprite start={53} end={60}>
        {({ localTime }) => {
          const o = Easing.easeOutCubic(Math.min(localTime / 0.8, 1));
          return (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 28,
              opacity: o,
              background: 'linear-gradient(135deg, #1B3FA1 0%, #15307A 100%)',
            }}>
              <div style={{
                position: 'absolute', left: '-10%', top: '-10%',
                width: '40%', height: '40%', borderRadius: '50%',
                background: '#fff', opacity: 0.06, filter: 'blur(40px)',
              }} />
              <div style={{
                position: 'absolute', right: '-15%', bottom: '-15%',
                width: '50%', height: '50%', borderRadius: '50%',
                background: '#fff', opacity: 0.05, filter: 'blur(50px)',
              }} />
              <Eyebrow color="rgba(255,255,255,0.7)" style={{ display: 'block' }}>
                Gérer Mon Chantier
              </Eyebrow>
              <div style={{
                fontSize: 84 * ts, fontWeight: 700,
                letterSpacing: '-0.025em', color: '#fff',
                lineHeight: 1.05, textAlign: 'center',
                padding: '0 6%',
              }}>
                Votre chantier piloté<br/>au millimètre.
              </div>
              <div style={{
                marginTop: 12,
                opacity: Math.min(1, Math.max(0, localTime - 1.2) / 0.8),
              }}>
                <div style={{
                  background: '#fff', color: COL.primary,
                  padding: '18px 36px', borderRadius: 14,
                  fontWeight: 700, fontSize: 22,
                  fontFamily: FONT,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                }}>VerifierMonDevis.fr</div>
              </div>
            </div>
          );
        }}
      </Sprite>
    </div>
  );
}

// ── small helpers used in v1 ─────────────────────────────────────────

function msgIn(t, start) {
  return Math.max(0, Math.min(1, (t - start) / 0.4));
}

function ChaosBubble({ icon, label, tone = 'blue' }) {
  const palette = {
    blue:   { fg: '#1D4ED8', bg: '#EFF4FF' },
    violet: { fg: '#6D28D9', bg: '#F3EEFE' },
    amber:  { fg: '#92400E', bg: '#FEF1E0' },
    green:  { fg: '#0B6B3C', bg: '#E5F8EE' },
  }[tone];
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      padding: '10px 16px',
      background: COL.card,
      border: `1px solid ${COL.borderSoft}`,
      borderRadius: 999,
      boxShadow: '0 10px 30px -10px rgba(15,25,50,0.25)',
      fontFamily: FONT,
    }}>
      <span style={{
        width: 28, height: 28, borderRadius: 999,
        background: palette.bg, color: palette.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14,
      }}>{icon}</span>
      <span style={{ fontWeight: 600, fontSize: 14, color: COL.text }}>{label}</span>
    </div>
  );
}

function DigestLine({ icon, tone, label, delay, t }) {
  const palette = {
    blue:   { fg: '#1D4ED8', bg: '#EFF4FF', border: COL.cockpitBlue },
    violet: { fg: '#6D28D9', bg: '#F3EEFE', border: COL.violet },
    orange: { fg: '#92400E', bg: '#FEF1E0', border: COL.amber },
    green:  { fg: '#0B6B3C', bg: '#E5F8EE', border: COL.emerald },
  }[tone];
  const o = Math.max(0, Math.min(1, (t - delay) / 0.4));
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      background: palette.bg,
      borderLeft: `3px solid ${palette.border}`,
      borderRadius: 8,
      fontFamily: FONT,
      opacity: o,
      transform: `translateX(${(1 - o) * -12}px)`,
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{
        fontSize: 14, fontWeight: 600,
        color: palette.fg,
      }}>{label}</span>
    </div>
  );
}

Object.assign(window, { SceneV1, ChaosBubble, DigestLine, msgIn });
