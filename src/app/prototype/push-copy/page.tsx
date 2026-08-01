import type { Metadata } from "next";
import { Suspense } from "react";
import { PushCopyPrototype } from "./PushCopyPrototype";

export const metadata: Metadata = {
  title: "PROTÓTIPO — Copy de push | Combinado",
};

export default function PushCopyPrototypePage() {
  return <Suspense fallback={null}><PushCopyPrototype /></Suspense>;
}
