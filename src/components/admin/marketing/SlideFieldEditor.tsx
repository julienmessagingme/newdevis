import CharCountInput from "./CharCountInput";
import { CHAR_LIMITS } from "./helpers";
import type { SlideData } from "@/types/marketing";

interface Props {
  templateName: string;
  fields: SlideData;
  onChange: (updated: SlideData) => void;
}

/**
 * Éditeur de champs d'une slide — GÉNÉRIQUE.
 * Affiche un champ pour chaque texte présent dans la slide, quel que soit le
 * template (les ~30 templates V3 n'étaient pas dans l'ancien switch → "Template
 * inconnu"). On édite ce qui existe ; on masque les champs structurels.
 */

// Champs structurels / non-éditables au texte — masqués de l'éditeur.
const HIDDEN_KEYS = new Set([
  "template", "product_screen", "background_url", "bg_photo", "decor",
]);

// Champs rendus en <textarea> (texte long). Les autres → <input> simple.
const MULTILINE_KEYS = new Set([
  "text", "subtext", "caption", "quote", "translation", "situation",
  "verdict_detail", "answer", "before_text", "after_text",
  "myth_text", "reality_text",
]);

// Libellés lisibles pour les clés connues (fallback = la clé brute).
const FIELD_LABELS: Record<string, string> = {
  text: "Titre / texte principal",
  subtext: "Sous-titre",
  headline: "Titre",
  stat_value: "Chiffre (ex : 70%)",
  quote: "Citation",
  translation: "Traduction / explication",
  caption: "Légende",
  situation: "Situation",
  verdict_detail: "Détail du verdict",
  verdict_label: "Label verdict",
  flag: "Flag",
  short_url: "URL courte",
  prefix: "Préfixe",
  arrow: "Flèche (texte)",
  author: "Auteur",
  label: "Label",
  section_label: "Label de section",
  emoji: "Emoji",
  before_text: "Avant",
  after_text: "Après",
  myth_text: "Mythe",
  reality_text: "Réalité",
  question: "Question",
  answer: "Réponse",
  left_label: "Label gauche",
  left_value: "Valeur gauche",
  right_label: "Label droite",
  right_value: "Valeur droite",
};

export default function SlideFieldEditor({ templateName, fields, onChange }: Props) {
  const limits = CHAR_LIMITS[templateName] ?? {};
  const set = (key: string, value: unknown) => onChange({ ...fields, [key]: value });

  const entries = Object.entries(fields as unknown as Record<string, unknown>)
    .filter(([k]) => !HIDDEN_KEYS.has(k));

  const editable = entries.filter(
    ([, v]) => typeof v === "string" || typeof v === "number" || Array.isArray(v),
  );

  if (editable.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucun champ texte sur cette slide.</p>;
  }

  return (
    <>
      {editable.map(([key, value]) => {
        const label = FIELD_LABELS[key] ?? key;

        if (key === "items" && Array.isArray(value)) {
          return (
            <ItemsEditor
              key={key}
              items={value as string[]}
              onChange={(items) => set("items", items)}
              label="Items de la liste"
            />
          );
        }
        if (key === "messages" && Array.isArray(value)) {
          return (
            <MessagesEditor
              key={key}
              messages={value as { text: string; time: string; is_sent: boolean }[]}
              onChange={(m) => set("messages", m)}
            />
          );
        }
        if (Array.isArray(value)) return null;

        if (typeof value === "number") {
          return (
            <div key={key} className="space-y-1">
              <label className="text-sm font-medium">{label}</label>
              <input
                type="number"
                value={value}
                onChange={(e) => set(key, parseInt(e.target.value, 10) || 0)}
                className="w-24 rounded-md border border-input px-3 py-2 text-sm bg-background"
              />
            </div>
          );
        }

        // string
        const str = value as string;
        return (
          <CharCountInput
            key={key}
            label={label}
            value={str}
            maxChars={limits[key] ?? 200}
            multiline={MULTILINE_KEYS.has(key) || str.length > 60}
            onChange={(v) => set(key, v)}
          />
        );
      })}
    </>
  );
}

function ItemsEditor({
  items,
  onChange,
  label,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  label: string;
}) {
  const updateItem = (i: number, v: string) => {
    const next = [...items];
    next[i] = v;
    onChange(next);
  };
  const addItem = () => onChange([...items, ""]);
  const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            className="flex-1 rounded-md border border-input px-3 py-1.5 text-sm bg-background"
            placeholder={`Item ${i + 1}`}
          />
          <button
            onClick={() => removeItem(i)}
            className="text-red-500 hover:text-red-700 text-sm px-2"
          >
            ×
          </button>
        </div>
      ))}
      <button onClick={addItem} className="text-xs text-primary hover:underline">
        + Ajouter un item
      </button>
    </div>
  );
}

function MessagesEditor({
  messages,
  onChange,
}: {
  messages: { text: string; time: string; is_sent: boolean }[];
  onChange: (m: { text: string; time: string; is_sent: boolean }[]) => void;
}) {
  const update = (i: number, key: string, value: unknown) => {
    const next = messages.map((m, idx) => (idx === i ? { ...m, [key]: value } : m));
    onChange(next);
  };
  const add = () => onChange([...messages, { text: "", time: "", is_sent: false }]);
  const remove = (i: number) => onChange(messages.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Messages WhatsApp</label>
      {messages.map((m, i) => (
        <div key={i} className="flex gap-2 items-start border rounded-lg p-2 bg-muted/30">
          <div className="flex-1 space-y-1">
            <input
              value={m.text}
              onChange={(e) => update(i, "text", e.target.value)}
              placeholder="Message"
              className="w-full rounded-md border border-input px-2 py-1 text-sm bg-background"
            />
            <div className="flex gap-2 items-center">
              <input
                value={m.time}
                onChange={(e) => update(i, "time", e.target.value)}
                placeholder="HH:MM"
                className="w-20 rounded-md border border-input px-2 py-1 text-xs bg-background"
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={m.is_sent}
                  onChange={(e) => update(i, "is_sent", e.target.checked)}
                />
                Envoyé
              </label>
            </div>
          </div>
          <button onClick={() => remove(i)} className="text-red-500 text-sm px-1">×</button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-primary hover:underline">
        + Ajouter un message
      </button>
    </div>
  );
}
