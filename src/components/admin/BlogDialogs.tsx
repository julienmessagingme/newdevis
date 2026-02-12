import { Sparkles, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BlogPost } from "./blogTypes";

// ============================================================
// DELETE DIALOG
// ============================================================

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: BlogPost | null;
  onConfirm: () => void;
}

export const DeleteDialog = ({ open, onOpenChange, post, onConfirm }: DeleteDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Supprimer l'article</DialogTitle>
        <DialogDescription>
          Êtes-vous sûr de vouloir supprimer "{post?.title}" ? Cette action est irréversible.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          Supprimer
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ============================================================
// AI GENERATION DIALOG
// ============================================================

interface AiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: string;
  onTopicChange: (value: string) => void;
  keywords: string;
  onKeywordsChange: (value: string) => void;
  targetLength: string;
  onTargetLengthChange: (value: string) => void;
  isGenerating: boolean;
  onGenerate: () => void;
}

export const AiGenerationDialog = ({
  open, onOpenChange, topic, onTopicChange,
  keywords, onKeywordsChange, targetLength, onTargetLengthChange,
  isGenerating, onGenerate
}: AiDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Générer un article avec l'IA
        </DialogTitle>
        <DialogDescription>
          L'article sera créé en brouillon et devra être relu avant publication.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div>
          <Label htmlFor="ai-topic">Sujet de l'article</Label>
          <Textarea
            id="ai-topic"
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder="Ex: Comment vérifier les assurances d'un artisan avant de signer un devis"
            rows={3}
          />
        </div>
        <div>
          <Label htmlFor="ai-keywords">Mots-clés SEO (optionnel)</Label>
          <Input
            id="ai-keywords"
            value={keywords}
            onChange={(e) => onKeywordsChange(e.target.value)}
            placeholder="devis artisan, assurance décennale, garantie"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Séparés par des virgules
          </p>
        </div>
        <div>
          <Label htmlFor="ai-length">Longueur cible</Label>
          <Select value={targetLength} onValueChange={onTargetLengthChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="800">Court (~800 mots)</SelectItem>
              <SelectItem value="1200">Moyen (~1200 mots)</SelectItem>
              <SelectItem value="1500">Long (~1500 mots)</SelectItem>
              <SelectItem value="2000">Très long (~2000 mots)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
          Annuler
        </Button>
        <Button onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Génération en cours...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Générer
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ============================================================
// SCHEDULE DIALOG
// ============================================================

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: BlogPost | null;
  date: string;
  onDateChange: (value: string) => void;
  time: string;
  onTimeChange: (value: string) => void;
  onConfirm: () => void;
}

export const ScheduleDialog = ({
  open, onOpenChange, post,
  date, onDateChange, time, onTimeChange,
  onConfirm
}: ScheduleDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-purple-500" />
          Programmer la publication
        </DialogTitle>
        <DialogDescription>
          L'article "{post?.title}" sera publié automatiquement à la date choisie.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div>
          <Label htmlFor="schedule-date">Date de publication</Label>
          <Input
            id="schedule-date"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
          />
        </div>
        <div>
          <Label htmlFor="schedule-time">Heure</Label>
          <Input
            id="schedule-time"
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
        <Button onClick={onConfirm} className="bg-purple-600 hover:bg-purple-700">
          <Clock className="mr-2 h-4 w-4" />
          Programmer
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
