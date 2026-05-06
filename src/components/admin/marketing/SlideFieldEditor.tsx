import CharCountInput from "./CharCountInput";
import { CHAR_LIMITS } from "./helpers";
import type { SlideData } from "@/types/marketing";

interface Props {
  templateName: string;
  fields: SlideData;
  onChange: (updated: SlideData) => void;
}

export default function SlideFieldEditor({ templateName, fields, onChange }: Props) {
  const limits = CHAR_LIMITS[templateName] ?? {};
  const set = (key: string, value: unknown) =>
    onChange({ ...fields, [key]: value });

  const textField = (key: string, label: string, multiline = false) => {
    const val = (fields as Record<string, unknown>)[key];
    if (typeof val !== "string" && val !== undefined) return null;
    return (
      <CharCountInput
        key={key}
        label={label}
        value={(val as string) ?? ""}
        maxChars={limits[key] ?? 200}
        onChange={(v) => set(key, v)}
        multiline={multiline}
      />
    );
  };

  switch (templateName) {
    case "texte_creme":
      return <>{textField("text", "Texte principal")}{textField("subtext", "Sous-texte")}</>;
    case "image_overlay":
      return <>{textField("text", "Texte overlay")}</>;
    case "stat_geante":
      return <>{textField("stat_value", "Stat (ex: 70%)")}{textField("text", "Légende")}</>;
    case "cta":
      return <>{textField("text", "CTA texte")}{textField("short_url", "URL courte")}</>;
    case "fond_couleur":
      return <>{textField("text", "Texte", true)}{textField("label", "Label")}</>;
    case "punchline_noir":
      return <>{textField("text", "Punchline")}</>;
    case "gradient_doux":
      return <>{textField("text", "Texte", true)}</>;
    case "titre_section":
      return <>{textField("section_label", "Label section")}{textField("text", "Titre")}</>;
    case "etape_numerotee":
      return (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium">Numéro d'étape</label>
            <input
              type="number"
              min={1}
              max={10}
              value={fields.step_number ?? 1}
              onChange={(e) => set("step_number", parseInt(e.target.value) || 1)}
              className="w-20 rounded-md border border-input px-3 py-2 text-sm bg-background"
            />
          </div>
          {textField("text", "Texte")}
          {textField("subtext", "Sous-texte")}
        </>
      );
    case "temoignage":
      return <>{textField("text", "Témoignage", true)}{textField("author", "Auteur")}</>;
    case "avant_apres":
      return <>{textField("before_text", "Avant")}{textField("after_text", "Après")}</>;
    case "mythe_realite":
      return <>{textField("myth_text", "Mythe")}{textField("reality_text", "Réalité")}</>;
    case "verdict":
      return <>{textField("verdict_label", "Label verdict")}{textField("text", "Texte")}</>;
    case "comparatif":
      return (
        <>
          {textField("left_label", "Label gauche")}
          {textField("left_value", "Valeur gauche")}
          {textField("right_label", "Label droite")}
          {textField("right_value", "Valeur droite")}
        </>
      );
    case "checklist":
      return <ItemsEditor items={fields.items ?? []} onChange={(items) => set("items", items)} label="Items checklist" />;
    case "liste_puces":
      return <ItemsEditor items={fields.items ?? []} onChange={(items) => set("items", items)} label="Items liste" />;
    case "hero_image":
      return <>{textField("text", "Texte")}{textField("label", "Label")}</>;
    case "question_reponse":
      return <>{textField("question", "Question")}{textField("answer", "Réponse", true)}</>;
    case "pov_whatsapp":
      return <MessagesEditor messages={fields.messages ?? []} onChange={(m) => set("messages", m)} />;
    case "emoji_accent":
      return <>{textField("emoji", "Emoji")}{textField("text", "Texte")}</>;
    default:
      return <p className="text-xs text-muted-foreground">Template inconnu : {templateName}</p>;
  }
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
