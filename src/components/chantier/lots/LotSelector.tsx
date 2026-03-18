import { useState } from "react";
import { PlusCircle, Check, X } from "lucide-react";

interface LotOption {
  id: string;
  nom: string;
  emoji?: string | null;
}

interface LotSelectorProps {
  lots: LotOption[];
  selectedLotId: string | null;
  onSelect: (lotId: string | null) => void;
  chantierId: string;
  token: string;
  onLotCreated?: (lot: LotOption) => void;
  disabled?: boolean;
  label?: string;
}

export default function LotSelector({
  lots,
  selectedLotId,
  onSelect,
  chantierId,
  token,
  onLotCreated,
  disabled = false,
  label = "Lot",
}: LotSelectorProps) {
  const [creating, setCreating] = useState(false);
  const [newLotName, setNewLotName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const name = newLotName.trim();
    if (!name || saving) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/chantier/${chantierId}/lots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nom: name }),
      });

      if (!res.ok) {
        console.error("[LotSelector] create lot error:", res.status);
        return;
      }

      const { lot } = await res.json();
      onLotCreated?.({ id: lot.id, nom: lot.nom, emoji: lot.emoji });
      onSelect(lot.id);
      setCreating(false);
      setNewLotName("");
    } catch (e) {
      console.error("[LotSelector] create lot error:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="text-xs text-slate-500 mb-1 block">{label}</label>

      <select
        value={selectedLotId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        disabled={disabled || creating}
        className="w-full bg-white/[0.05] border border-white/[0.08] text-white text-xs rounded-lg px-2.5 py-2 appearance-none outline-none focus:border-blue-500/50 disabled:opacity-50"
      >
        <option value="">— Aucun lot —</option>
        {lots.map((l) => (
          <option key={l.id} value={l.id}>
            {l.emoji ?? ""} {l.nom}
          </option>
        ))}
      </select>

      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={disabled}
          className="mt-1.5 flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
        >
          <PlusCircle className="h-3 w-3" />
          Créer un lot
        </button>
      ) : (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="text"
            value={newLotName}
            onChange={(e) => setNewLotName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewLotName("");
              }
            }}
            placeholder="Nom du lot"
            autoFocus
            disabled={saving}
            className="flex-1 min-w-0 bg-white/[0.05] border border-white/[0.08] text-white text-xs rounded px-2 py-1.5 outline-none focus:border-blue-500/50 placeholder:text-slate-600 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !newLotName.trim()}
            className="p-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewLotName("");
            }}
            disabled={saving}
            className="p-1 rounded bg-white/5 text-slate-500 hover:text-slate-300 disabled:opacity-50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
