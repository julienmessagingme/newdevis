import React, { useState, useEffect, useMemo } from "react";
import { MessageSquare, Mail, X, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import ConversationList from "./ConversationList";
import ConversationThread from "./ConversationThread";

interface Contact {
  id: string;
  nom: string;
  email?: string;
  telephone?: string;
  role?: string;
}

interface MessagerieSectionProps {
  chantierId: string;
  chantierNom: string;
  token: string;
}

export default function MessagerieSection({
  chantierId,
  chantierNom,
  token,
}: MessagerieSectionProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (!chantierId || !token) return;
    fetch(`/api/chantier/${chantierId}/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : { contacts: [] })
      .then((data) => setContacts(data.contacts ?? []))
      .catch(() => {});
  }, [chantierId, token]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newMsgContactId, setNewMsgContactId] = useState<string | null>(null);

  const [userName, setUserName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const meta = user.user_metadata || {};
        setUserName(
          [meta.first_name, meta.last_name].filter(Boolean).join(" ") ||
            user.email ||
            ""
        );
      }
    });
  }, []);

  const {
    conversations,
    isLoading: convsLoading,
    totalUnread,
    refresh: refreshConvs,
  } = useConversations(chantierId);

  const {
    messages,
    isLoading: msgsLoading,
    sendMessage,
    sending,
    refresh: refreshMsgs,
  } = useMessages(chantierId, selectedConvId);

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  const templateVars = useMemo(
    () => ({
      chantier_nom: chantierNom,
      artisan_nom: selectedConv?.contact_name ?? "",
      client_nom: userName,
    }),
    [chantierNom, selectedConv?.contact_name, userName]
  );

  // Contacts that have an email (required for messaging)
  const emailContacts = useMemo(
    () => contacts.filter((c) => c.email),
    [contacts]
  );

  // Build a fake conversation object for new message flow
  const newMsgContact = useMemo(() => {
    if (!newMsgContactId) return null;
    const c = contacts.find((ct) => ct.id === newMsgContactId);
    if (!c) return null;
    return {
      id: "__new__",
      contact_name: c.nom,
      contact_email: c.email || "",
      contact_phone: c.telephone ?? null,
      contact_id: c.id,
    };
  }, [newMsgContactId, contacts]);

  const handleSend = async (subject: string, body: string) => {
    const contactId = selectedConv?.contact_id || newMsgContactId;
    if (!contactId) return;
    const ok = await sendMessage(contactId, subject, body);
    if (ok) {
      await refreshConvs();
      setShowNewMessage(false);
      setNewMsgContactId(null);
    }
  };

  const handleNewMessage = () => {
    setShowNewMessage(true);
  };

  const handleSelectContact = (contactId: string) => {
    // Check if a conversation already exists for this contact
    const existing = conversations.find((c) => c.contact_id === contactId);
    if (existing) {
      setSelectedConvId(existing.id);
      setShowNewMessage(false);
      setNewMsgContactId(null);
    } else {
      setNewMsgContactId(contactId);
      setSelectedConvId(null);
      setShowNewMessage(false);
    }
  };

  const handleBack = () => {
    setSelectedConvId(null);
    setNewMsgContactId(null);
  };

  const handleSelectConv = (convId: string) => {
    setSelectedConvId(convId);
    setNewMsgContactId(null);
    setShowNewMessage(false);
  };

  // Determine what to show in the right panel
  const showThread = selectedConv || newMsgContact;
  const threadConv = selectedConv
    ? {
        id: selectedConv.id,
        contact_name: selectedConv.contact_name,
        contact_email: selectedConv.contact_email,
        contact_phone: selectedConv.contact_phone,
        contact_id: selectedConv.contact_id,
      }
    : newMsgContact;

  // Template vars for new message contact
  const activeTemplateVars = useMemo(
    () => ({
      chantier_nom: chantierNom,
      artisan_nom: threadConv?.contact_name ?? "",
      client_nom: userName,
    }),
    [chantierNom, threadConv?.contact_name, userName]
  );

  // Mobile: show either list or thread
  const mobileShowThread = !!(selectedConvId || newMsgContactId);

  return (
    <div className="h-full flex relative">
      {/* Contact picker overlay */}
      {showNewMessage && (
        <div className="absolute inset-0 z-20 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">Nouveau message</h3>
              <button
                onClick={() => setShowNewMessage(false)}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {emailContacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                  <Mail className="h-8 w-8" />
                  <p className="text-sm text-center px-4">
                    Aucun contact avec email.
                    <br />
                    Ajoutez un email aux contacts du chantier.
                  </p>
                </div>
              ) : (
                emailContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectContact(c.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.nom}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {c.role && (
                          <span className="text-gray-400">{c.role} - </span>
                        )}
                        {c.email}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Left column: conversation list */}
      <div
        className={`w-full lg:w-80 lg:flex-shrink-0 border-r border-gray-200 h-full ${
          mobileShowThread ? "hidden lg:block" : "block"
        }`}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedConvId}
          onSelect={handleSelectConv}
          onNewMessage={handleNewMessage}
          isLoading={convsLoading}
        />
      </div>

      {/* Right column: thread or empty state */}
      <div
        className={`flex-1 min-w-0 h-full ${
          mobileShowThread ? "block" : "hidden lg:block"
        }`}
      >
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
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <MessageSquare className="h-10 w-10" />
            <p className="text-sm text-center">
              Selectionnez une conversation
              <br />
              ou creez-en une nouvelle
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
