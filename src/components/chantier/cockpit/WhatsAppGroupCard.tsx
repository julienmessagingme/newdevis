import React, { useState } from "react";
import { MessageCircle, Check, Copy, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WhatsAppGroupCardProps {
  chantierId: string;
  chantierNom: string;
  token: string;
  groupId: string | null;
  inviteLink: string | null;
  onGroupCreated: (groupId: string, inviteLink: string) => void;
}

export default function WhatsAppGroupCard({
  chantierId,
  chantierNom,
  token,
  groupId,
  inviteLink,
  onGroupCreated,
}: WhatsAppGroupCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/whatsapp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
      onGroupCreated(data.groupId, data.inviteLink);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/whatsapp`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── État : groupe existant ────────────────────────────────────────────────
  if (groupId) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-white">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-green-800">
              <Check className="h-3.5 w-3.5" />
              Groupe WhatsApp actif
            </div>
            <p className="text-xs text-green-600">{`Chantier - ${chantierNom}`}</p>
            {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="text-green-700 hover:bg-green-100 text-xs gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copié !" : "Lien"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUpdate}
            disabled={loading}
            className="text-green-700 hover:bg-green-100 text-xs gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Mettre à jour
          </Button>
        </div>
      </div>
    );
  }

  // ── État : pas encore de groupe ───────────────────────────────────────────
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white">
            <MessageCircle className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">Groupe WhatsApp</p>
            <p className="text-xs text-gray-500">
              Réunissez les artisans et le client dans un groupe
            </p>
            {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={loading}
          className="bg-[#25D366] hover:bg-[#1da851] text-white text-xs gap-1.5"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Création...
            </>
          ) : (
            "Créer le groupe"
          )}
        </Button>
      </div>
    </div>
  );
}
