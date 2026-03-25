import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ConversationSummary {
  id: string;
  chantier_id: string;
  contact_id: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  reply_address: string;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  last_message?: {
    body_text: string;
    direction: "outbound" | "inbound";
    created_at: string;
  };
}

interface UseConversationsReturn {
  conversations: ConversationSummary[];
  isLoading: boolean;
  error: string | null;
  totalUnread: number;
  refresh: () => Promise<void>;
}

export function useConversations(
  chantierId: string | undefined
): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!chantierId) return;
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
        `/api/chantier/${chantierId}/conversations`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      if (!res.ok) throw new Error("Erreur chargement conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [chantierId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.unread_count || 0),
    0
  );

  return {
    conversations,
    isLoading,
    error,
    totalUnread,
    refresh: fetchConversations,
  };
}
