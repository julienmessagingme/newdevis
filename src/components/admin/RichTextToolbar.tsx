import { useState, useRef, useCallback, useEffect } from "react";
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  List, ListOrdered, Code, Smile, Undo, Redo
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RichTextToolbarProps {
  value: string;
  onChange: (html: string) => void;
}

const EMOJIS = ["✅", "❌", "⚠️", "💡", "📌", "🔧", "🏠", "💰", "📋", "👷", "🔍", "📞"];

const RichTextToolbar = ({ value, onChange }: RichTextToolbarProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showEmojis, setShowEmojis] = useState(false);
  const [mode, setMode] = useState<"visual" | "source">("visual");
  const isInternalUpdate = useRef(false);

  // Sync external value changes to contentEditable
  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
    isInternalUpdate.current = false;
  }, [value]);

  const execCommand = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncContent();
  }, []);

  const syncContent = useCallback(() => {
    if (editorRef.current) {
      isInternalUpdate.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    syncContent();
  }, [syncContent]);

  const insertHeading = useCallback((level: string) => {
    execCommand("formatBlock", level);
  }, [execCommand]);

  const insertEmoji = useCallback((emoji: string) => {
    execCommand("insertText", emoji);
    setShowEmojis(false);
  }, [execCommand]);

  const handleSourceChange = useCallback((html: string) => {
    onChange(html);
  }, [onChange]);

  const toolbarButtons = [
    { icon: Heading1, action: () => insertHeading("h1"), title: "Titre H1" },
    { icon: Heading2, action: () => insertHeading("h2"), title: "Titre H2" },
    { icon: Heading3, action: () => insertHeading("h3"), title: "Titre H3" },
    { type: "separator" as const },
    { icon: Bold, action: () => execCommand("bold"), title: "Gras" },
    { icon: Italic, action: () => execCommand("italic"), title: "Italique" },
    { type: "separator" as const },
    { icon: List, action: () => execCommand("insertUnorderedList"), title: "Liste à puces" },
    { icon: ListOrdered, action: () => execCommand("insertOrderedList"), title: "Liste numérotée" },
    { type: "separator" as const },
    { icon: Undo, action: () => execCommand("undo"), title: "Annuler" },
    { icon: Redo, action: () => execCommand("redo"), title: "Rétablir" },
  ];

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Mode toggle */}
      <div className="flex items-center justify-between bg-muted/50 border-b px-2 py-1">
        <div className="flex items-center gap-1">
          {mode === "visual" && toolbarButtons.map((btn, i) => {
            if ("type" in btn && btn.type === "separator") {
              return <div key={i} className="w-px h-6 bg-border mx-1" />;
            }
            const Icon = btn.icon!;
            return (
              <Button
                key={i}
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={btn.action}
                title={btn.title}
              >
                <Icon className="h-4 w-4" />
              </Button>
            );
          })}

          {mode === "visual" && (
            <>
              <div className="w-px h-6 bg-border mx-1" />
              <div className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowEmojis(!showEmojis)}
                  title="Emojis"
                >
                  <Smile className="h-4 w-4" />
                </Button>
                {showEmojis && (
                  <div className="absolute top-full left-0 z-50 mt-1 p-2 bg-popover border rounded-lg shadow-lg grid grid-cols-6 gap-1">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded text-lg"
                        onClick={() => insertEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setMode(mode === "visual" ? "source" : "visual")}
        >
          <Code className="h-3 w-3" />
          {mode === "visual" ? "Source HTML" : "Éditeur visuel"}
        </Button>
      </div>

      {/* Editor area */}
      {mode === "visual" ? (
        <div
          ref={editorRef}
          contentEditable
          className="min-h-[400px] p-4 focus:outline-none prose prose-sm max-w-none
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2
            [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2
            [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4
            [&_li]:mb-1"
          onInput={syncContent}
          onPaste={handlePaste}
          onBlur={syncContent}
          suppressContentEditableWarning
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="min-h-[400px] font-mono text-sm border-0 rounded-none focus-visible:ring-0"
          placeholder="<h2>Mon titre</h2><p>Mon paragraphe...</p>"
        />
      )}
    </div>
  );
};

export default RichTextToolbar;
