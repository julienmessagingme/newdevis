// src/components/chantier/cockpit/WhatsAppThread.tsx
import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowLeft, MessageCircle, FileText, Mic } from 'lucide-react';

interface WaMessage {
  id: string;
  from_number: string;
  from_me: boolean;
  type: string;
  body: string | null;
  media_url: string | null;
  timestamp: string;
}

interface Contact {
  telephone?: string;
  nom: string;
}

interface Props {
  chantierId: string;
  chantierNom: string;
  token: string;
  contacts: Contact[];     // to resolve sender names from phone numbers
  onBack: () => void;
}

function formatPhone(raw: string): string {
  // "33612345678" → "06 12 34 56 78"
  if (raw.startsWith('33') && raw.length === 11) {
    const local = '0' + raw.slice(2);
    return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  }
  return raw;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function WhatsAppThread({ chantierId, chantierNom, token, contacts, onBack }: Props) {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Build phone → name map from contacts
  const phoneMap = new Map<string, string>();
  for (const c of contacts) {
    if (c.telephone) {
      // normalize: strip spaces/dashes, handle leading 0 → 33
      const digits = c.telephone.replace(/\D/g, '');
      const normalized = digits.startsWith('0') && digits.length === 10
        ? '33' + digits.slice(1)
        : digits;
      phoneMap.set(normalized, c.nom);
    }
  }

  useEffect(() => {
    if (!chantierId || !token) return;
    fetch(`/api/chantier/${chantierId}/whatsapp-messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data) => {
        setMessages(data.messages ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [chantierId, token]);

  // Auto-scroll to bottom when messages load
  useEffect(() => {
    if (!loading) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [loading, messages.length]);

  function getSenderName(msg: WaMessage): string {
    if (msg.from_me) return 'Moi';
    return phoneMap.get(msg.from_number) ?? formatPhone(msg.from_number);
  }

  function renderMessageContent(msg: WaMessage) {
    if (msg.type === 'image' && msg.media_url) {
      return (
        <div className="space-y-1">
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
            <img
              src={msg.media_url}
              alt="photo"
              className="max-w-[200px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            />
          </a>
          {msg.body && <p className="text-sm">{msg.body}</p>}
        </div>
      );
    }
    if (msg.type === 'document' && msg.media_url) {
      return (
        <a
          href={msg.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:underline"
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm truncate max-w-[180px]">{msg.body ?? 'Document'}</span>
        </a>
      );
    }
    if (msg.type === 'audio' || msg.type === 'voice') {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Mic className="h-4 w-4 flex-shrink-0" />
          <span>{msg.body ?? 'Message vocal'}</span>
        </div>
      );
    }
    return <p className="text-sm whitespace-pre-wrap break-words">{msg.body ?? ''}</p>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700 lg:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
          <MessageCircle className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900">Groupe WhatsApp</p>
          <p className="text-xs text-gray-400 truncate">{chantierNom}</p>
        </div>
        <p className="text-xs text-gray-400 ml-auto flex-shrink-0">Lecture seule</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-[#ECE5DD]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
            Aucun message WhatsApp reçu pour l'instant
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.from_me ? 'items-end' : 'items-start'}`}>
              {/* Sender name (only for others) */}
              {!msg.from_me && (
                <p className="text-[10px] font-medium text-gray-500 mb-0.5 ml-1">
                  {getSenderName(msg)}
                </p>
              )}
              <div
                className={`max-w-[75%] px-3 py-2 rounded-lg shadow-sm ${
                  msg.from_me
                    ? 'bg-[#DCF8C6] text-gray-800 rounded-tr-none'
                    : 'bg-white text-gray-800 rounded-tl-none'
                }`}
              >
                {renderMessageContent(msg)}
                <p className={`text-[10px] text-gray-400 mt-1 ${msg.from_me ? 'text-right' : 'text-left'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
