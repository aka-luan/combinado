"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The one details layer shared by the agenda. It deliberately lives in a
 * portal so the authenticated shell can become inert without also disabling
 * the sheet itself.
 */
export function OccurrenceSheet({ open, title, triggerRef, onClose, children }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const historyMarkerRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const shell = document.querySelector<HTMLElement>("[data-authenticated-shell]");
    const hadAriaHidden = shell?.hasAttribute("aria-hidden") ?? false;
    const previousAriaHidden = shell ? shell.getAttribute("aria-hidden") : null;
    shell?.setAttribute("inert", "");
    shell?.setAttribute("aria-hidden", "true");

    const closeFromHistory = (event: PopStateEvent) => {
      if (event.state?.combinadoOccurrenceSheet === true) return;
      historyMarkerRef.current = false;
      onCloseRef.current();
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet();
      }
    };

    const closeSheet = () => {
      if (historyMarkerRef.current && window.history.state?.combinadoOccurrenceSheet === true) {
        historyMarkerRef.current = false;
        window.history.back();
      }
      onCloseRef.current();
    };

    window.history.pushState(
      { ...(window.history.state ?? {}), combinadoOccurrenceSheet: true },
      "",
    );
    historyMarkerRef.current = true;
    window.addEventListener("popstate", closeFromHistory);
    document.addEventListener("keydown", closeFromEscape);

    const focusFrame = window.requestAnimationFrame(() => {
      titleRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("popstate", closeFromHistory);
      document.removeEventListener("keydown", closeFromEscape);

      if (historyMarkerRef.current && window.history.state?.combinadoOccurrenceSheet === true) {
        historyMarkerRef.current = false;
        window.history.back();
      }

      if (shell) {
        shell.removeAttribute("inert");
        if (hadAriaHidden) {
          if (previousAriaHidden === null) shell.removeAttribute("aria-hidden");
          else shell.setAttribute("aria-hidden", previousAriaHidden);
        } else {
          shell.removeAttribute("aria-hidden");
        }
      }

      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [open, triggerRef]);

  if (!open || typeof document === "undefined") return null;

  const titleId = `occurrence-sheet-title-${slugify(title)}`;

  return createPortal(
    <>
      <button
        type="button"
        className="occurrence-sheet__backdrop"
        aria-label="Fechar detalhes"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        className="occurrence-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-occurrence-sheet
      >
        <div className="occurrence-sheet__handle" aria-hidden="true" />
        <div className="occurrence-sheet__header">
          <div>
            <p className="occurrence-sheet__eyebrow">Detalhes da Ocorrência</p>
            <h2 id={titleId} ref={titleRef} tabIndex={-1}>
              {title}
            </h2>
          </div>
          <button type="button" className="occurrence-sheet__close" onClick={onClose}>
            Fechar detalhes
          </button>
        </div>
        <div className="occurrence-sheet__content">{children}</div>
      </section>
    </>,
    document.body,
  );
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 48);
}
