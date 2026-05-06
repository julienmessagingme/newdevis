import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import GenerateDialog from "./GenerateDialog";

interface GenerateButtonProps {
  authToken: string | null;
  onGenerated: () => void;
}

export default function GenerateButton({ authToken, onGenerated }: GenerateButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Play className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Générer le prochain</span>
        <span className="sm:hidden">Générer</span>
      </Button>
      <GenerateDialog
        open={open}
        authToken={authToken}
        onClose={() => setOpen(false)}
        onGenerated={onGenerated}
      />
    </>
  );
}
