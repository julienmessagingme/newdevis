// captureError — error-tracking maison (alternative légère à Sentry), côté serveur Vercel.
// Best-effort, ne throw JAMAIS. Sur erreur applicative : insère une ligne dans `error_log`
// (service-role) + envoie un message Telegram instantané. Tout est gated sur les env vars
// -> no-op silencieux si non configuré (zéro risque à shipper avant que les secrets soient posés).
//
// Usage : `import { captureError } from '@/lib/integrations/errorReporter';`
//         `catch (e) { await captureError('stripe-webhook', e, { userId }); ... }`
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
const tgToken = import.meta.env.TELEGRAM_ERROR_BOT_TOKEN;
const tgChat = import.meta.env.TELEGRAM_ERROR_CHAT_ID;

export interface ErrorContext {
  userId?: string | null;
  [key: string]: unknown;
}

export async function captureError(
  source: string,
  error: unknown,
  context?: ErrorContext,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;

  // 1) Persistance error_log (service-role). Jamais bloquant.
  try {
    if (supabaseUrl && serviceKey) {
      await createClient(supabaseUrl, serviceKey).from('error_log').insert({
        source,
        message,
        stack,
        context: context ?? null,
        user_id: (context?.userId as string | undefined) ?? null,
      });
    }
  } catch { /* jamais bloquant */ }

  // 2) Alerte Telegram instantanée. Jamais bloquant.
  try {
    if (tgToken && tgChat) {
      const ctxStr = context ? `\n${JSON.stringify(context)}` : '';
      const text = `🔴 VMD/GMC · ${source}\n${message}${ctxStr}`.slice(0, 3800);
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text, disable_web_page_preview: true }),
      });
    }
  } catch { /* jamais bloquant */ }
}
