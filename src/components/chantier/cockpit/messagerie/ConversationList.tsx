import React, { useState, useMemo } from "react";
import { Search, Plus, Loader2 } from "lucide-react";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700",
  "bg-rose-100 text-rose-700",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash += name.charCodeAt(i);
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "hier";

  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

interface ConversationListProps {
  conversations: Array<{
    id: string;
    contact_name: string;
    contact_email: string;
    contact_phone?: string | null;
    unread_count: number;
    last_message_at: string | null;
    last_message?: {
      body_text: string;
      direction: "outbound" | "inbound";
      created_at: string;
    };
  }>;
  selectedId: string | null;
  onSelect: (convId: string) => void;
  onNewMessage: () => void;
  isLoading: boolean;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewMessage,
  isLoading,
}: ConversationListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) =>
      c.contact_name.toLowerCase().includes(q)
    );
  }, [conversations, search]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3">
        <h2 className="font-semibold">Messagerie</h2>
        <button
          onClick={onNewMessage}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-500">
            Aucune conversation
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            const hasUnread = conv.unread_count > 0;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                  isSelected
                    ? "bg-blue-50 border-l-2 border-blue-600"
                    : "border-l-2 border-transparent"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${getAvatarColor(conv.contact_name)}`}
                >
                  {getInitials(conv.contact_name)}
                </div>

                {/* Middle */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm truncate ${
                      hasUnread ? "font-bold" : "font-medium"
                    }`}
                  >
                    {conv.contact_name}
                  </p>
                  {conv.last_message && (
                    <p className="text-xs text-gray-500 truncate">
                      {conv.last_message.direction === "outbound"
                        ? "Vous: "
                        : ""}
                      {conv.last_message.body_text}
                    </p>
                  )}
                </div>

                {/* Right */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-400">
                    {formatRelativeDate(conv.last_message_at)}
                  </span>
                  {hasUnread && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
