import type { SlideData } from "@/types/marketing";

interface Props {
  templateName: string;
  fields: SlideData;
  accentColor?: string;
}

/**
 * Mini-preview visuelle d'une slide de carrousel.
 * Reproduit les templates HTML du backend Python (agents/src/templates/*.html)
 * en React + Tailwind, à une échelle réduite pour le dashboard.
 */
export default function SlidePreview({ templateName, fields, accentColor = "#2563EB" }: Props) {
  const accent = accentColor;

  switch (templateName) {
    case "punchline_noir":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#0A0A0A] flex items-center justify-center p-6 relative">
          <p className="text-white text-center font-bold text-base leading-snug">
            {fields.text || "Texte punchline"}
          </p>
          <Signature dark />
        </div>
      );

    case "texte_creme":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col items-center justify-center p-6 gap-2 relative">
          <p className="text-[#1E293B] text-center font-bold text-base leading-snug">
            {fields.text || "Texte principal"}
          </p>
          {fields.subtext && (
            <p className="text-[#64748B] text-center text-xs">{fields.subtext}</p>
          )}
          <Signature />
        </div>
      );

    case "stat_geante":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col items-center justify-center p-6 gap-1 relative">
          <p className="font-black text-4xl" style={{ color: accent, letterSpacing: "-0.04em" }}>
            {fields.stat_value || "0%"}
          </p>
          <p className="text-[#1E293B] text-center text-xs font-medium mt-1">
            {fields.text || "Description stat"}
          </p>
          <Signature />
        </div>
      );

    case "cta":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden flex flex-col items-center justify-center p-6 gap-3 relative" style={{ background: accent }}>
          <p className="text-white text-center font-bold text-sm leading-snug">
            {fields.text || "Texte CTA"}
          </p>
          {fields.short_url && (
            <span className="bg-black/15 text-white text-xs px-3 py-1.5 rounded-md font-medium">
              {fields.short_url}
            </span>
          )}
        </div>
      );

    case "hero_image":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#444] relative flex flex-col justify-end p-6">
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-[1]" />
          <div className="relative z-[2]">
            <p className="text-white font-bold text-sm leading-snug">
              {fields.text || "Texte hero"}
            </p>
            {fields.label && (
              <p className="text-white/70 text-xs mt-1">{fields.label}</p>
            )}
          </div>
          <Signature dark />
        </div>
      );

    case "gradient_doux":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden flex items-center justify-center p-6 relative"
          style={{ background: "linear-gradient(135deg, #DBEAFE 0%, #EDE9FE 100%)" }}>
          <p className="text-[#1E3A5F] text-center font-bold text-sm leading-snug">
            {fields.text || "Texte"}
          </p>
          <Signature />
        </div>
      );

    case "etape_numerotee":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex items-center p-5 gap-3 relative">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-extrabold text-lg shrink-0"
            style={{ background: accent }}>
            {fields.step_number ?? 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#1E293B] font-bold text-sm leading-snug truncate">
              {fields.text || "Étape"}
            </p>
            {fields.subtext && (
              <p className="text-[#64748B] text-xs mt-0.5 truncate">{fields.subtext}</p>
            )}
          </div>
          <Signature />
        </div>
      );

    case "mythe_realite":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col justify-center p-5 gap-3 relative">
          <div className="flex items-start gap-2">
            <span className="text-lg shrink-0">❌</span>
            <p className="text-red-600 font-semibold text-xs line-through leading-snug">
              {fields.myth_text || "Mythe"}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg shrink-0">✅</span>
            <p className="text-green-700 font-bold text-xs leading-snug">
              {fields.reality_text || "Réalité"}
            </p>
          </div>
          <Signature />
        </div>
      );

    case "avant_apres":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col justify-center p-5 gap-3 relative">
          <div>
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Avant</span>
            <p className="text-[#1E293B] font-semibold text-xs mt-0.5">{fields.before_text || "—"}</p>
          </div>
          <div className="border-t border-dashed border-gray-300" />
          <div>
            <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Après</span>
            <p className="text-[#1E293B] font-semibold text-xs mt-0.5">{fields.after_text || "—"}</p>
          </div>
          <Signature />
        </div>
      );

    case "temoignage":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col justify-center p-6 gap-2 relative">
          <span className="text-3xl text-gray-300">"</span>
          <p className="text-[#1E293B] text-xs italic leading-relaxed">
            {fields.text || "Témoignage"}
          </p>
          {fields.author && (
            <p className="text-[#64748B] text-[10px] font-medium mt-1">— {fields.author}</p>
          )}
          <Signature />
        </div>
      );

    case "comparatif":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex items-center p-4 gap-2 relative">
          <div className="flex-1 text-center">
            <p className="text-[10px] font-bold uppercase text-[#64748B]">{fields.left_label || "Option A"}</p>
            <p className="text-xs font-semibold text-[#1E293B] mt-1">{fields.left_value || "—"}</p>
          </div>
          <div className="text-lg font-bold text-gray-300">VS</div>
          <div className="flex-1 text-center">
            <p className="text-[10px] font-bold uppercase text-[#64748B]">{fields.right_label || "Option B"}</p>
            <p className="text-xs font-semibold text-[#1E293B] mt-1">{fields.right_value || "—"}</p>
          </div>
          <Signature />
        </div>
      );

    case "fond_couleur":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden flex flex-col items-center justify-center p-6 gap-2 relative"
          style={{ background: accent, color: "white" }}>
          <p className="text-center font-bold text-sm leading-snug">{fields.text || "Texte"}</p>
          {fields.label && <p className="text-white/80 text-xs">{fields.label}</p>}
        </div>
      );

    case "verdict":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col items-center justify-center p-6 gap-2 relative">
          {fields.verdict_label && (
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase text-white" style={{ background: accent }}>
              {fields.verdict_label}
            </span>
          )}
          <p className="text-[#1E293B] text-center font-bold text-sm">{fields.text || "Verdict"}</p>
          <Signature />
        </div>
      );

    case "checklist":
    case "liste_puces":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col justify-center p-5 gap-1.5 relative">
          {(fields.items ?? ["Item 1", "Item 2", "Item 3"]).map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-[#1E293B]">
              <span className="shrink-0" style={{ color: accent }}>
                {templateName === "checklist" ? "☑" : "•"}
              </span>
              <span>{item}</span>
            </div>
          ))}
          <Signature />
        </div>
      );

    case "question_reponse":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col justify-center p-5 gap-3 relative">
          <p className="font-bold text-sm" style={{ color: accent }}>
            {fields.question || "Question ?"}
          </p>
          <p className="text-[#1E293B] text-xs leading-relaxed">
            {fields.answer || "Réponse..."}
          </p>
          <Signature />
        </div>
      );

    case "emoji_accent":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col items-center justify-center p-6 gap-2 relative">
          <span className="text-4xl">{fields.emoji || "💡"}</span>
          <p className="text-[#1E293B] text-center font-bold text-sm">{fields.text || "Texte"}</p>
          <Signature />
        </div>
      );

    case "titre_section":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#FDF6EC] flex flex-col items-center justify-center p-6 gap-1 relative">
          {fields.section_label && (
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
              {fields.section_label}
            </span>
          )}
          <p className="text-[#1E293B] text-center font-bold text-base">{fields.text || "Titre"}</p>
          <Signature />
        </div>
      );

    case "image_overlay":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#444] relative flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" />
          <p className="relative z-10 text-white text-center font-bold text-sm px-4">
            {fields.text || "Texte overlay"}
          </p>
          <Signature dark />
        </div>
      );

    case "pov_whatsapp":
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-[#ECE5DD] flex flex-col justify-end p-3 gap-1.5 relative">
          {(fields.messages ?? [{ text: "Message...", time: "10:30", is_sent: false }]).map((m, i) => (
            <div key={i} className={`max-w-[80%] px-2.5 py-1.5 rounded-lg text-[11px] ${
              m.is_sent ? "bg-[#DCF8C6] self-end" : "bg-white self-start"
            }`}>
              <p className="text-[#111]">{m.text}</p>
              <p className="text-[9px] text-gray-400 text-right mt-0.5">{m.time}</p>
            </div>
          ))}
        </div>
      );

    default:
      return (
        <div className="aspect-[4/5] w-full max-w-[280px] rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center p-6">
          <p className="text-gray-400 text-xs text-center">Aperçu non disponible ({templateName})</p>
        </div>
      );
  }
}

function Signature({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`absolute bottom-2 left-3 text-[8px] font-medium ${dark ? "text-white/40" : "text-gray-400"}`}>
      @verifiermondevis
    </div>
  );
}
