import { useId } from "react";

interface CharCountInputProps {
  value: string;
  maxChars: number;
  onChange: (value: string) => void;
  label?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
}

export default function CharCountInput({
  value,
  maxChars,
  onChange,
  label,
  multiline = false,
  rows = 3,
  placeholder,
}: CharCountInputProps) {
  const id = useId();
  const over = value.length > maxChars;
  const Tag = multiline ? "textarea" : "input";

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <Tag
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? rows : undefined}
        className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary ${
          over ? "border-red-400 focus:ring-red-400" : "border-input"
        }`}
      />
      <div className={`text-xs text-right ${over ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
        {value.length}/{maxChars}
      </div>
    </div>
  );
}
