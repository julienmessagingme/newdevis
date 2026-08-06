// notifyTelegram — notifications business (pas erreurs) vers le bot perso de Johan.
//
// 2026-08-06 — demande Johan : recevoir sur SON portable les événements
// business (nouvel inscrit VMD/GMC, analyse en pending_review). Bot DÉDIÉ,
// distinct du bot error-tracking de Julien (@Messagingmeapp_bot,
// cf. _shared/error-reporter.ts qui reste intouché).
//
// Secrets requis (Supabase Function Secrets) :
//   TELEGRAM_NOTIF_BOT_TOKEN — token du bot perso Johan (via @BotFather)
//   TELEGRAM_NOTIF_CHAT_ID   — chat_id de Johan avec ce bot
//
// Best-effort : ne throw JAMAIS. No-op silencieux si secrets absents
// (PAS de fallback sur le bot erreurs — les notifs business ne doivent pas
// atterrir chez Julien par accident).
// Miroir Vercel : src/lib/integrations/telegramNotify.ts.

function envOf(name: string): string | undefined {
  try { return typeof Deno !== "undefined" ? Deno.env.get(name) : undefined; } catch { return undefined; }
}

const TG_TOKEN = envOf("TELEGRAM_NOTIF_BOT_TOKEN");
const TG_CHAT = envOf("TELEGRAM_NOTIF_CHAT_ID");

export async function notifyTelegram(text: string): Promise<void> {
  try {
    if (!TG_TOKEN || !TG_CHAT) return;
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text: text.slice(0, 3800),
        disable_web_page_preview: true,
      }),
    });
  } catch { /* jamais bloquant */ }
}
