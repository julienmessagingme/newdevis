// notifyTelegram — notifications business (pas erreurs) vers le bot perso de Johan.
//
// 2026-08-06 — demande Johan : recevoir sur SON portable les événements
// business (analyse en pending_review notamment). Bot DÉDIÉ, distinct du bot
// error-tracking de Julien (@Messagingmeapp_bot, cf. errorReporter.ts qui
// reste intouché).
//
// Env vars requises (Vercel, + redeploy — import.meta.env inliné au build) :
//   TELEGRAM_NOTIF_BOT_TOKEN — token du bot perso Johan (via @BotFather)
//   TELEGRAM_NOTIF_CHAT_ID   — chat_id de Johan avec ce bot
//
// Best-effort : ne throw JAMAIS. No-op silencieux si env absentes
// (PAS de fallback sur le bot erreurs — les notifs business ne doivent pas
// atterrir chez Julien par accident).
// Miroir Deno : supabase/functions/_shared/telegram-notify.ts.

const TG_TOKEN = import.meta.env.TELEGRAM_NOTIF_BOT_TOKEN;
const TG_CHAT = import.meta.env.TELEGRAM_NOTIF_CHAT_ID;

export async function notifyTelegram(text: string): Promise<void> {
  try {
    if (!TG_TOKEN || !TG_CHAT) return;
    // ⚠️ Vercel serverless : l'appelant doit AWAIT (fire-and-forget pur = requête
    // coupée dès le return de la lambda, cf. piège CLAUDE.md).
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text: text.slice(0, 3800),
        disable_web_page_preview: true,
      }),
    });
  } catch {
    /* jamais bloquant */
  }
}
