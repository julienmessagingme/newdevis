import { lazy, Suspense } from "react";
import ReactApp from "@/components/ReactApp";
import type { Brand } from "@/lib/brand";
const Register = lazy(() => import("@/components/pages/Register"));
export default function RegisterApp({ brand }: { brand?: Brand }) {
  return <ReactApp><Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}><Register brand={brand} /></Suspense></ReactApp>;
}
