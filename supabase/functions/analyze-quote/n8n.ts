// ============================================================
// N8N WEBHOOK CALL (prix marche) — JSON payload, no binary
// ============================================================

export async function callN8NWebhook(
  workItems: { description: string }[],
  codePostal: string | null,
): Promise<unknown> {
  const n8nUrl = Deno.env.get("N8N_WEBHOOK_URL");
  if (!n8nUrl) {
    console.log("[N8N] N8N_WEBHOOK_URL not configured, skipping");
    return null;
  }

  try {
    const payload = {
      items: workItems,
      zip: codePostal || "",
    };

    console.log("[N8N] Calling webhook:", n8nUrl, "items:", workItems.length, "zip:", codePostal);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[N8N] HTTP ${response.status} - ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log("[N8N] Response received:", JSON.stringify(data).substring(0, 200));
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn("[N8N] Timeout after 15s");
    } else {
      console.warn("[N8N] Error:", err instanceof Error ? err.message : String(err));
    }
    return null;
  }
}
