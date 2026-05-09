import React, { useState } from "react";
import { Send, Mail, Loader2, MessageCircle } from "lucide-react";
import TemplateSelector from "./TemplateSelector";

interface MessageComposerProps {
  contactName: string;
  contactPhone?: string;
  variables: Record<string, string>;
  onSend: (subject: string, body: string) => Promise<void>;
  sending: boolean;
}

function formatPhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "33" + cleaned.slice(1);
  }
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

export default function MessageComposer({
  contactName,
  contactPhone,
  variables,
  onSend,
  sending,
}: MessageComposerProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending;

  async function handleSend() {
    if (!canSend) return;
    try {
      await onSend(subject, body);
      setSubject("");
      setBody("");
    } catch {
      // Error handled by parent
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Objet du message"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Votre message..."
        className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        style={{ minHeight: 120 }}
      />

      <div className="flex items-center justify-between pt-2">
        <TemplateSelector
          variables={variables}
          onSelect={(s, b) => {
            setSubject(s);
            setBody(b);
          }}
        />

        <div className="flex items-center gap-2">
          {contactPhone && (
            <a
              href={`https://wa.me/${formatPhone(contactPhone)}?text=${encodeURIComponent(body)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
