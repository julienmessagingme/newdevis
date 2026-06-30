import { lazy, Suspense } from "react";
import ReactApp from "@/components/ReactApp";
import type { ComponentProps } from "react";

const HubPage = lazy(() => import("@/components/pages/seo/HubPage"));

type Props = ComponentProps<typeof HubPage extends React.LazyExoticComponent<infer T> ? T : never>;

export default function HubPageApp(props: any) {
  return (
    <ReactApp>
      <Suspense
        fallback={
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <HubPage {...props} />
      </Suspense>
    </ReactApp>
  );
}
