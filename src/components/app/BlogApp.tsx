import { lazy, Suspense } from "react";
import ReactApp from "@/components/ReactApp";
const Blog = lazy(() => import("@/components/pages/Blog"));
export default function BlogApp() {
  return <ReactApp><Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}><Blog /></Suspense></ReactApp>;
}
