import React, { useState } from "react";
import { MessageCircle, Copy, Check, ChevronDown, ChevronUp, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WaMember {
  id: string;
  group_id: string;
  phone: string;
  name: string;
  role: string;   // 'gmc' | 'client' | 'artisan'
  status: string; // 'active' | 'left' | 'removed'
  joined_at: string;
  left_at: string | null;
}

export interface WaGroup {
  id: string;
  name: string;
  group_jid: string;
  invite_link: string | null;
  created_at: string;
  members: WaMember[];
}

interface Contact {
  id: string;
  nom: string;
  telephone?: string;
}

interface WhatsAppGroupsPanelProps {
  chantierId: string;
  token: string;
  groups: WaGroup[];
  contacts: Contact[];
  onGroupCreated: (group: WaGroup) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return "33" + digits.slice(1);
  return digits;
}

function isValidPhone(raw: string): boolean {
  return normalizePhone(raw).length >= 10;
}

function roleLabel(role: string): string {
  if (role === "gmc") return "GMC";
  if (role === "client") return "Client";
  return "Artisan";
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function WhatsAppGroupsPanel({
  chantierId,
  token,
  groups,
  contacts,
  onGroupCreated,
}: WhatsAppGroupsPanelProps) {
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("Groupe principal");
  const [checkedPhones, setCheckedPhones] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Filter contacts that have a valid phone number
  const phoneContacts = contacts.filter(
    (c) => c.telephone && isValidPhone(c.telephone)
  );

  function openModal() {
    const initialPhones = new Set(
      phoneContacts.map((c) => normalizePhone(c.telephone!))
    );
    setCheckedPhones(initialPhones);
    setGroupName("Groupe principal");
    setCreateError(null);
    setModalOpen(true);
  }

  function togglePhone(phone: string) {
    setCheckedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else {
        next.add(phone);
      }
      return next;
    });
  }

  function toggleMembers(groupId: string) {
    setExpandedGroupId((prev) => (prev === groupId ? null : groupId));
  }

  function handleCopyLink(group: WaGroup) {
    if (!group.invite_link) return;
    navigator.clipboard.writeText(group.invite_link);
    setCopiedGroupId(group.id);
    setTimeout(() => setCopiedGroupId(null), 2000);
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const selectedPhones = Array.from(checkedPhones);
      const res = await fetch(`/api/chantier/${chantierId}/whatsapp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: groupName, selectedPhones }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur inconnue");
      onGroupCreated(data.group);
      setModalOpen(false);
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="border-b border-gray-100">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[#25D366]" />
          <span className="text-sm font-semibold text-gray-800">Groupes WhatsApp</span>
        </div>
        <Button
          size="sm"
          onClick={openModal}
          className="bg-[#25D366] hover:bg-[#1da851] text-white text-xs h-7 px-2 gap-1"
        >
          Nouveau groupe
        </Button>
      </div>

      {/* Group list */}
      {groups.length === 0 ? (
        <p className="text-xs text-gray-400 px-4 pb-3">
          Aucun groupe WhatsApp. Créez votre premier groupe !
        </p>
      ) : (
        <div className="space-y-0">
          {groups.map((group) => {
            const isExpanded = expandedGroupId === group.id;
            const isCopied = copiedGroupId === group.id;
            const activeMembers = (group.members ?? [])
              .filter((m) => m.status === "active")
              .sort((a, b) => {
                if (a.role === "gmc") return -1;
                if (b.role === "gmc") return 1;
                return 0;
              });
            const inactiveMembers = (group.members ?? []).filter(
              (m) => m.status !== "active"
            );

            return (
              <div key={group.id} className="border-t border-gray-100">
                {/* Group row */}
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-800 min-w-0 truncate">
                    {group.name}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {group.invite_link && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyLink(group)}
                        className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700 gap-1"
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {isCopied ? "Copié" : "Lien"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleMembers(group.id)}
                      className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700 gap-1"
                    >
                      <Users className="h-3.5 w-3.5" />
                      Membres
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Member list (expanded) */}
                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1.5 bg-gray-50 border-t border-gray-100">
                    {activeMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 py-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                        <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">
                          {m.name}
                        </span>
                        <span className="text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {roleLabel(m.role)}
                        </span>
                      </div>
                    ))}
                    {inactiveMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 py-1">
                        <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                        <span className="text-sm text-gray-400 flex-1 min-w-0 truncate">
                          {m.name}
                        </span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {m.status === "removed" ? "Retiré" : "A quitté"}
                          {m.left_at ? ` ${formatDate(m.left_at)}` : ""}
                        </span>
                      </div>
                    ))}
                    {(group.members ?? []).length === 0 && (
                      <p className="text-xs text-gray-400 py-1">Aucun membre</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create group modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau groupe WhatsApp</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Group name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du groupe
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            {/* Participants */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Participants</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {phoneContacts.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    Aucun contact avec numéro de téléphone valide.
                  </p>
                ) : (
                  phoneContacts.map((c) => {
                    const phone = normalizePhone(c.telephone!);
                    const checked = checkedPhones.has(phone);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-3 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePhone(phone)}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-800">
                          {c.nom}
                          <span className="text-gray-400 ml-2">{c.telephone}</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {/* Fixed info row */}
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                <span>👤</span>
                <span>Client (vous) et GérerMonChantier sont toujours inclus</span>
              </div>
            </div>

            {/* Error */}
            {createError && (
              <p className="text-sm text-red-500">{createError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={creating}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !groupName.trim()}
              className="bg-[#25D366] hover:bg-[#1da851] text-white gap-2"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
