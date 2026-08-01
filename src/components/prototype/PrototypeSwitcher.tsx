"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./PrototypeSwitcher.module.css";

export type PrototypeVariant = {
  key: string;
  name: string;
};

export function PrototypeSwitcher({ variants, current }: { variants: PrototypeVariant[]; current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function move(offset: number) {
    const currentIndex = Math.max(0, variants.findIndex((variant) => variant.key === current));
    const next = variants[(currentIndex + offset + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next.key);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (process.env.NODE_ENV === "production") return null;
  const active = variants.find((variant) => variant.key === current) ?? variants[0];

  return (
    <nav className={styles.switcher} aria-label="Alternar variante do protótipo">
      <button type="button" onClick={() => move(-1)} aria-label="Variante anterior">←</button>
      <span><strong>{active.key}</strong> — {active.name}</span>
      <button type="button" onClick={() => move(1)} aria-label="Próxima variante">→</button>
    </nav>
  );
}
