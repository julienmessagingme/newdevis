// ============================================================
// N8N WEBHOOK CALL (prix marché)
// ============================================================

export async function callN8NWebhook(
  fileBytes: Uint8Array,
  fileName: string,
  mimeType: string,
  workType: string | null,
  codePostal: string | null,
): Promise<unknown> {
  const n8nUrl = Deno.env.get("N8N_WEBHOOK_URL");
  if (!n8nUrl) {
    console.log("[N8N] N8N_WEBHOOK_URL not configured, skipping");
    return null;
  }

  try {
    console.log("[N8N] Calling webhook:", n8nUrl, "file:", fileName, "size:", fileBytes.length);
    const blob = new Blob([fileBytes], { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, fileName);
    formData.append("job_type", workType || "");
    formData.append("zip", codePostal || "");
    formData.append("qty", "1");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(n8nUrl, {
      method: "POST",
      body: formData,
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
