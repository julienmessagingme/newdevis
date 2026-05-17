import { Loader2 } from "lucide-react";
import { proxyImg } from "@/lib/marketing/proxyImg";
import type { BackgroundItem } from "@/types/marketing";

interface Props {
  backgrounds: BackgroundItem[];
  loading: boolean;
}

export default function BackgroundGrid({ backgrounds, loading }: Props) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (backgrounds.length === 0) {
    return <p className="text-center text-muted-foreground py-12">Aucun fond trouvé.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {backgrounds.map((bg) => (
        <div key={bg.id} className="border rounded-xl overflow-hidden bg-card">
          <div className="aspect-square bg-muted relative">
            <img
              src={proxyImg(bg.public_url)}
              alt={bg.id}
              referrerPolicy="no-referrer"
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-3 space-y-1.5">
            <div className="font-mono text-xs text-muted-foreground">{bg.id}</div>
            <div className="text-xs">
              <span className="inline-block px-2 py-0.5 rounded bg-muted text-muted-foreground">
                {bg.category}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {bg.compatible_moods.map((m) => (
                <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
