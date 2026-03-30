import { Button } from "@/components/ui/button";
import { FileText, RefreshCw, LogOut } from "lucide-react";

interface AdminHeaderProps {
  onRefresh: () => void;
  refreshing: boolean;
}

export default function AdminHeader({ onRefresh, refreshing }: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border">
      <div className="container flex h-16 items-center justify-between">
        <a href="/" className="flex items-center gap-2 sm:gap-3">
          <img
            alt="VerifierMonDevis.fr"
            className="h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-md"
            src="/images/logo-detoure.webp"
            width={64}
            height={64}
          />
          <span className="text-base sm:text-2xl font-bold leading-none">
            <span className="text-foreground">VerifierMon</span><span className="text-orange-500">Devis</span><span className="text-sm sm:text-lg font-semibold text-orange-500">.fr</span>
          </span>
          <span className="ml-2 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded">
            Admin
          </span>
        </a>

        <div className="flex items-center gap-2">
          <a href="/admin/blog">
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Blog
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <a href="/">
            <Button variant="ghost" size="icon">
              <LogOut className="h-5 w-5" />
            </Button>
          </a>
        </div>
      </div>
    </header>
  );
}
