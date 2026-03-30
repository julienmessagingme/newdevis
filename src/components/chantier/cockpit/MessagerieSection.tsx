import React, { useState, useEffect, useMemo } from "react";
import { MessageSquare, Mail, Search, Loader2, User, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import ConversationThread from "./ConversationThread";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  id: string;
  nom: string;
  email?: string;
  telephone?: string;
  role?: string;
}

interface AnalyseArtisan {
  analyse_id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  siret: string | null;
  lot_id: string | null;
}

interface MessagerieSectionProps {
  chantierId: string;
  chantierNom: string;
  token: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700",
  "bg-rose-100 text-rose-700",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "hier";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function MessagerieSection({ chantierId, chantierNom, token }: MessagerieSectionProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const artisanMapRef = React.useRef<Map<string, AnalyseArtisan>>(new Map());
  const [search, setSearch] = useState("");
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [newMsgContactId, setNewMsgContactId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  // ── Fetch contacts ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chantierId || !token) return;
    fetch(`/api/chantier/${chantierId}/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { contacts: [], analyseArtisans: [] }))
      .then((data) => {
        const dbContacts: Contact[] = data.contacts ?? [];
        const artisans: AnalyseArtisan[] = data.analyseArtisans ?? [];

        const seenSirets = new Set(
          dbContacts.map((c) => (c as any).siret).filter(Boolean)
        );
        const seenNames = new Set(dbContacts.map((c) => c.nom.toLowerCase()));

        const newArtisanMap = new Map<string, AnalyseArtisan>();
        const artisanContacts: Contact[] = artisans
          .filter((a) => {
            if (a.siret && seenSirets.has(a.siret)) return false;
            if (seenNames.has(a.nom.toLowerCase())) return false;
            return true;
          })
          .map((a) => {
            const syntheticId = `analyse-${a.analyse_id}`;
            newArtisanMap.set(syntheticId, a);
            return { id: syntheticId, nom: a.nom, email: a.email ?? undefined, telephone: a.telephone ?? undefined };
          });

        artisanMapRef.current = newArtisanMap;
        setContacts([...dbContacts, ...artisanContacts]);
      })
      .catch(() => {});
  }, [chantierId, token]);

  // ── Fetch user name ───────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const m = user.user_metadata || {};
        setUserName([m.first_name, m.last_name].filter(Boolean).join(" ") || user.email || "");
      }
    });
  }, []);

  // ── Conversations & messages ──────────────────────────────────────────────
  const { conversations, isLoading: convsLoading, refresh: refreshConvs } = useConversations(chantierId);
  const { messages, isLoading: msgsLoading, sendMessage, sending, refresh: refreshMsgs } = useMessages(chantierId, selectedConvId);

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  // ── Build unified contact list ────────────────────────────────────────────
  // Each contact shows: avatar, name, role, last message preview (if conversation exists)
  // Contacts WITH conversations first, then contacts without

  type ContactRow = {
    contactId: string;
    nom: string;
    email?: string;
    telephone?: string;
    role?: string;
    convId?: string;
    unreadCount: number;
    lastMessageAt: string | null;
    lastMessagePreview?: string;
    lastMessageDirection?: "outbound" | "inbound";
    hasConversation: boolean;
  };

  const contactRows = useMemo(() => {
    const emailContacts = contacts.filter((c) => c.email);

    // Map contact id → conversation
    const convByContactId = new Map<string, (typeof conversations)[0]>();
    for (const conv of conversations) {
      if (conv.contact_id) convByContactId.set(conv.contact_id, conv);
    }

    const rows: ContactRow[] = emailContacts.map((c) => {
      const conv = convByContactId.get(c.id);
      return {
        contactId: c.id,
        nom: c.nom,
        email: c.email,
        telephone: c.telephone,
        role: c.role,
        convId: conv?.id,
        unreadCount: conv?.unread_count ?? 0,
        lastMessageAt: conv?.last_message_at ?? null,
        lastMessagePreview: conv?.last_message?.body_text,
        lastMessageDirection: conv?.last_message?.direction,
        hasConversation: !!conv,
      };
    });

    // Also add conversations whose contact is NOT in the contacts list (edge case)
    const seenContactIds = new Set(emailContacts.map((c) => c.id));
    for (const conv of conversations) {
      if (conv.contact_id && !seenContactIds.has(conv.contact_id)) {
        rows.push({
          contactId: conv.contact_id,
          nom: conv.contact_name,
          email: conv.contact_email,
          telephone: conv.contact_phone ?? undefined,
          convId: conv.id,
          unreadCount: conv.unread_count,
          lastMessageAt: conv.last_message_at,
          lastMessagePreview: conv.last_message?.body_text,
          lastMessageDirection: conv.last_message?.direction,
          hasConversation: true,
        });
      }
    }

    // Sort: conversations with unread first, then by last message date, then alphabetical
    rows.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
      if (a.hasConversation && !b.hasConversation) return -1;
      if (!a.hasConversation && b.hasConversation) return 1;
      if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      return a.nom.localeCompare(b.nom);
    });

    return rows;
  }, [contacts, conversations]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return contactRows;
    const q = search.toLowerCase();
    return contactRows.filter((r) => r.nom.toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q));
  }, [contactRows, search]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectRow = async (row: ContactRow) => {
    if (row.convId) {
      // Has conversation → show thread
      setSelectedConvId(row.convId);
      setNewMsgContactId(null);
    } else {
      // No conversation → resolve artisan if needed, then open composer
      let resolvedId = row.contactId;
      if (row.contactId.startsWith("analyse-")) {
        const artisan = artisanMapRef.current.get(row.contactId);
        if (artisan) {
          try {
            const res = await fetch(`/api/chantier/${chantierId}/contacts`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ nom: artisan.nom, email: artisan.email, telephone: artisan.telephone, siret: artisan.siret, lot_id: artisan.lot_id, source: "analyse", analyse_id: artisan.analyse_id }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.contact?.id) {
                setContacts((prev) => prev.map((c) => (c.id === row.contactId ? { ...c, id: data.contact.id } : c)));
                artisanMapRef.current.delete(row.contactId);
                resolvedId = data.contact.id;
              }
            }
          } catch { /* fallthrough */ }
        }
      }
      setNewMsgContactId(resolvedId);
      setSelectedConvId(null);
    }
  };

  const newMsgContact = useMemo(() => {
    if (!newMsgContactId) return null;
    const c = contacts.find((ct) => ct.id === newMsgContactId);
    if (!c) return null;
    return { id: "__new__", contact_name: c.nom, contact_email: c.email || "", contact_phone: c.telephone ?? null, contact_id: c.id };
  }, [newMsgContactId, contacts]);

  const handleSend = async (subject: string, body: string) => {
    const contactId = selectedConv?.contact_id || newMsgContactId;
    if (!contactId) return;
    const ok = await sendMessage(contactId, subject, body);
    if (ok) {
      await refreshConvs();
      // Select the newly created conversation
      if (newMsgContactId) {
        setNewMsgContactId(null);
        // Refresh will have the new conversation — select it
        const updatedConvs = await refreshConvs();
      }
    }
  };

  const handleBack = () => {
    setSelectedConvId(null);
    setNewMsgContactId(null);
  };

  const threadConv = selectedConv
    ? { id: selectedConv.id, contact_name: selectedConv.contact_name, contact_email: selectedConv.contact_email, contact_phone: selectedConv.contact_phone, contact_id: selectedConv.contact_id }
    : newMsgContact;

  const activeTemplateVars = useMemo(() => ({
    chantier_nom: chantierNom,
    artisan_nom: threadConv?.contact_name ?? "",
    client_nom: userName,
  }), [chantierNom, threadConv?.contact_name, userName]);

  const mobileShowThread = !!(selectedConvId || newMsgContactId);
  const activeContactId = selectedConv?.contact_id ?? newMsgContactId;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex">
      {/* ── Left: unified contact/conversation list ──────────────────────── */}
      <div className={`w-full lg:w-80 lg:flex-shrink-0 border-r border-gray-200 h-full flex flex-col ${mobileShowThread ? "hidden lg:flex" : "flex"}`}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-sm text-gray-900">Messagerie</h2>
          <p className="text-xs text-gray-400 mt-0.5">Cliquez sur un contact pour démarrer ou voir la conversation</p>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un contact..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
            />
          </div>
        </div>

        {/* Contact rows */}
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2 px-4">
              <Mail className="h-8 w-8" />
              <p className="text-sm text-center">
                {contacts.length === 0
                  ? "Aucun contact avec email. Ajoutez un email à vos intervenants."
                  : "Aucun résultat"}
              </p>
            </div>
          ) : (
            filteredRows.map((row) => {
              const isActive = row.contactId === activeContactId;
              const hasUnread = row.unreadCount > 0;

              return (
                <button
                  key={row.contactId}
                  onClick={() => handleSelectRow(row)}
                  className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-colors border-l-2 ${
                    isActive
                      ? "bg-blue-50 border-blue-600"
                      : "border-transparent hover:bg-gray-50"
                  }`}
                >
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold ${getAvatarColor(row.nom)}`}>
                    {getInitials(row.nom)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm truncate ${hasUnread ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}>
                        {row.nom}
                      </p>
                      {row.role && (
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
                          {row.role}
                        </span>
                      )}
                    </div>
                    {row.hasConversation && row.lastMessagePreview ? (
                      <p className={`text-xs truncate mt-0.5 ${hasUnread ? "text-gray-700 font-medium" : "text-gray-500"}`}>
                        {row.lastMessageDirection === "outbound" ? "Vous: " : ""}
                        {row.lastMessagePreview}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{row.email}</p>
                    )}
                  </div>

                  {/* Right: date or "new" badge */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {row.hasConversation ? (
                      <>
                        <span className="text-[10px] text-gray-400">{formatRelativeDate(row.lastMessageAt)}</span>
                        {hasUnread && <span className="w-2 h-2 rounded-full bg-blue-600" />}
                      </>
                    ) : (
                      <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Send className="w-2.5 h-2.5" />
                        Écrire
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: thread or empty state ──────────────────────────────────── */}
      <div className={`flex-1 min-w-0 h-full ${mobileShowThread ? "block" : "hidden lg:block"}`}>
        {threadConv ? (
          <ConversationThread
            conversation={threadConv}
            messages={newMsgContact ? [] : messages}
            isLoading={newMsgContact ? false : msgsLoading}
            onSend={handleSend}
            sending={sending}
            onBack={handleBack}
            variables={activeTemplateVars}
            chantierNom={chantierNom}
            userName={userName}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 px-6">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
              <MessageSquare className="h-8 w-8 text-gray-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Sélectionnez un contact</p>
              <p className="text-xs text-gray-400 mt-1">
                Cliquez sur un intervenant pour voir ou démarrer une conversation
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
