import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Message {
  id: string;
  conversation_id: string;
  direction: "outbound" | "inbound";
  subject: string | null;
  body_text: string;
  body_html: string | null;
  status: string;
  created_at: string;
}

interface UseMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (
    contactId: string,
    subject: string,
    body: string
  ) => Promise<boolean>;
  sending: boolean;
  refresh: () => Promise<void>;
}

export function useMessages(
  chantierId: string | undefined,
  conversationId: string | null
): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!chantierId || !conversationId) {
      setMessages([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setIsLoading(false);
        return;
      }

      const res = await window.fetch(
        `/api/chantier/${chantierId}/conversations/${conversationId}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      if (!res.ok) throw new Error("Erreur chargement messages");
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [chantierId, conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const sendMessage = useCallback(
    async (
      contactId: string,
      subject: string,
      body: string
    ): Promise<boolean> => {
      if (!chantierId) return false;
      setSending(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return false;

        const res = await window.fetch(
          `/api/chantier/${chantierId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ contact_id: contactId, subject, body }),
          }
        );
        if (!res.ok) throw new Error("Erreur envoi message");
        await fetchMessages();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      } finally {
        setSending(false);
      }
    },
    [chantierId, fetchMessages]
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    sending,
    refresh: fetchMessages,
  };
}
