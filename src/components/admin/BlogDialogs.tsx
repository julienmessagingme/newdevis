import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
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
