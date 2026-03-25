import React, { useEffect, useRef } from "react";
import { ArrowLeft, Loader2, MessageSquare, Download } from "lucide-react";
import { generateConversationPdf } from "@/utils/generateConversationPdf";
import MessageComposer from "./MessageComposer";

interface ConversationThreadProps {
  conversation: {
    id: string;
    contact_name: string;
    contact_email: string;
    contact_phone?: string | null;
    contact_id?: string | null;
  };
  messages: Array<{
    id: string;
    direction: "outbound" | "inbound";
    subject: string | null;
    body_text: string;
    body_html: string | null;
    created_at: string;
  }>;
  isLoading: boolean;
  onSend: (subject: string, body: string) => Promise<void>;
  sending: boolean;
  onBack: () => void;
  variables: Record<string, string>;
  chantierNom?: string;
  userName?: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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

export default function ConversationThread({
  conversation,
  messages,
  isLoading,
  onSend,
  sending,
  onBack,
  variables,
  chantierNom = "",
  userName = "Vous",
}: ConversationThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <button
          type="button"
          onClick={onBack}
          className="lg:hidden p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{conversation.contact_name}</p>
          <p className="text-xs text-gray-500 truncate">
            {conversation.contact_email}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => generateConversationPdf(conversation, messages, chantierNom, userName)}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
              title="Exporter en PDF"
            >
              <Download className="h-3 w-3" />
              PDF
            </button>
          )}
          {conversation.contact_phone && (
            <a
              href={`https://wa.me/${formatPhone(conversation.contact_phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-200 transition-colors"
            >
              WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">Aucun message</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOutbound = msg.direction === "outbound";
            return (
              <div
                key={msg.id}
                className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-xl px-3 py-2 max-w-[80%] ${
                    isOutbound
                      ? "bg-blue-50 ml-auto"
                      : "bg-gray-50"
                  }`}
                >
                  {msg.subject && (
                    <p className="font-semibold text-sm mb-1">{msg.subject}</p>
                  )}

                  {!isOutbound && msg.body_html ? (
                    <div
                      className="prose prose-sm max-w-none text-sm"
                      dangerouslySetInnerHTML={{ __html: msg.body_html }}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.body_text}</p>
                  )}

                  <p className="text-xs text-gray-400 mt-1">
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t p-4">
        <MessageComposer
          contactName={conversation.contact_name}
          contactPhone={conversation.contact_phone ?? undefined}
          variables={variables}
          onSend={onSend}
          sending={sending}
        />
      </div>
    </div>
  );
}
