"use client";

import { useState, useEffect, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, X } from "lucide-react";
import Link from "next/link";

interface PageIntroModalProps {
  pageKey: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tip: string;
  actionLabel?: string;
  actionHref?: string;
}

export function PageIntroModal({
  pageKey,
  icon: Icon,
  title,
  description,
  tip,
  actionLabel,
  actionHref,
}: PageIntroModalProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(`closr-page-intro-${pageKey}`);
    if (dismissed) return;

    const frame = window.requestAnimationFrame(() => {
      setShow(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pageKey]);

  function dismiss() {
    localStorage.setItem(`closr-page-intro-${pageKey}`, "1");
    setShow(false);
  }

  if (!show) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm bg-black/40"
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-secondary hover:bg-background hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <Icon className="h-7 w-7 text-accent" />
          </div>

          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">{description}</p>

          <div className="mt-4 w-full rounded-xl bg-warning/5 border border-warning/10 px-4 py-3 flex items-start gap-2.5 text-left">
            <Lightbulb className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
            <span className="text-xs leading-relaxed text-secondary">{tip}</span>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={dismiss}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              知道了
            </button>
            {actionLabel && actionHref && (
              <Link
                href={actionHref}
                onClick={dismiss}
                className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground hover:bg-background transition-colors"
              >
                {actionLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
