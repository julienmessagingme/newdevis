import { lazy, Suspense } from "react";
import ReactApp from "@/components/ReactApp";
const MonChantierHub = lazy(() => import("@/components/pages/MonChantierHub"));
export default function MonChantierHubApp() {
  return (
    <ReactApp>
      <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
        <MonChantierHub />
      </Suspense>
    </ReactApp>
  );
}
