"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLocale } from "@/lib/i18n";

// ─── Types ──────────────────────────────────────────────────────────

export interface TourStep {
  target: string; // CSS selector
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

export interface SpotlightTourProps {
  tourKey: string;
  steps: TourStep[];
  onComplete?: () => void;
}

// ─── Tour Context (for useTour hook) ────────────────────────────────

interface TourContextValue {
  startTour: (key: string) => void;
  activeTourKey: string | null;
}

const TourContext = createContext<TourContextValue>({
  startTour: () => {},
  activeTourKey: null,
});

export function TourProvider({ children }: { children: ReactNode }) {
  const [activeTourKey, setActiveTourKey] = useState<string | null>(null);

  const startTour = useCallback((key: string) => {
    localStorage.removeItem(`closr-tour-${key}`);
    setActiveTourKey(key);
  }, []);

  return (
    <TourContext.Provider value={{ startTour, activeTourKey }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  return useContext(TourContext);
}

// ─── Viewport-relative rect (for fixed-position portal) ─────────────

interface ViewportRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_GAP = 12;
const EDGE_MARGIN = 12;

/** Returns viewport-relative rect directly from getBoundingClientRect. */
function getViewportRect(el: Element): ViewportRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// ─── Scroll-container utilities ─────────────────────────────────────

/** Walk up the DOM to find the nearest scrollable ancestor. */
function getScrollParent(el: Element): Element {
  let node: Element | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    if (
      (overflowY === "auto" || overflowY === "scroll" ||
       overflowX === "auto" || overflowX === "scroll") &&
      (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return document.documentElement;
}

/** Collect all scrollable ancestors for an element (for event listeners). */
function getScrollAncestors(el: Element): Element[] {
  const ancestors: Element[] = [];
  let node: Element | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    const ox = style.overflowX;
    if (oy === "auto" || oy === "scroll" || ox === "auto" || ox === "scroll") {
      ancestors.push(node);
    }
    node = node.parentElement;
  }
  return ancestors;
}

/** Scroll the target element into the visible area of its nearest scroll parent. */
function scrollTargetIntoView(el: Element): Promise<void> {
  const scrollParent = getScrollParent(el);
  const isDocEl = scrollParent === document.documentElement;

  if (isDocEl) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    // Check if el is visible within the scroll parent's viewport
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    const isVisible =
      elRect.top >= parentRect.top &&
      elRect.bottom <= parentRect.bottom;

    if (!isVisible) {
      // Calculate the scroll offset to center the element in the container
      const elRelativeTop = elRect.top - parentRect.top + scrollParent.scrollTop;
      const targetScroll = elRelativeTop - parentRect.height / 2 + elRect.height / 2;
      scrollParent.scrollTo({ top: targetScroll, behavior: "smooth" });
    }
  }

  // Wait for scroll to settle
  return new Promise((resolve) => setTimeout(resolve, 350));
}

// ─── Auto-flip + position calculator ────────────────────────────────

type Position = "top" | "bottom" | "left" | "right";

const FLIP_MAP: Record<Position, Position[]> = {
  bottom: ["bottom", "top", "right", "left"],
  top: ["top", "bottom", "right", "left"],
  left: ["left", "right", "bottom", "top"],
  right: ["right", "left", "bottom", "top"],
};

interface TooltipPlacement {
  top: number;
  left: number;
  width: number;
  actualPosition: Position;
}

function calcTooltipPlacement(
  rect: ViewportRect,
  preferred: Position,
  tooltipW: number,
  tooltipH: number,
): TooltipPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  function tryPosition(pos: Position): { top: number; left: number } | null {
    let top = 0;
    let left = 0;

    switch (pos) {
      case "bottom":
        top = rect.top + rect.height + PADDING + TOOLTIP_GAP;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "top":
        top = rect.top - PADDING - TOOLTIP_GAP - tooltipH;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.left - PADDING - TOOLTIP_GAP - tooltipW;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.left + rect.width + PADDING + TOOLTIP_GAP;
        break;
    }

    // Check if it fits within viewport
    if (top >= EDGE_MARGIN && top + tooltipH <= vh - EDGE_MARGIN &&
        left >= EDGE_MARGIN && left + tooltipW <= vw - EDGE_MARGIN) {
      return { top, left };
    }
    return null;
  }

  // Try preferred position first, then flip candidates
  const candidates = FLIP_MAP[preferred];
  for (const pos of candidates) {
    const result = tryPosition(pos);
    if (result) {
      return { ...result, width: tooltipW, actualPosition: pos };
    }
  }

  // Fallback: use preferred position with edge clamping
  let top = 0;
  let left = 0;
  switch (preferred) {
    case "bottom":
      top = rect.top + rect.height + PADDING + TOOLTIP_GAP;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case "top":
      top = rect.top - PADDING - TOOLTIP_GAP - tooltipH;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left - PADDING - TOOLTIP_GAP - tooltipW;
      break;
    case "right":
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left + rect.width + PADDING + TOOLTIP_GAP;
      break;
  }

  // Clamp
  left = Math.max(EDGE_MARGIN, Math.min(left, vw - EDGE_MARGIN - tooltipW));
  top = Math.max(EDGE_MARGIN, Math.min(top, vh - EDGE_MARGIN - tooltipH));

  return { top, left, width: tooltipW, actualPosition: preferred };
}

// ─── Main Component ─────────────────────────────────────────────────

export function SpotlightTour({ tourKey, steps, onComplete }: SpotlightTourProps) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const { activeTourKey } = useTour();
  const [active, setActive] = useState(false);
  const [current, setCurrent] = useState(0);
  const [targetRect, setTargetRect] = useState<ViewportRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);
  const rafRef = useRef<number>(0);

  // Check if this tour should auto-start
  useEffect(() => {
    if (steps.length === 0) return;
    const seen = localStorage.getItem(`closr-tour-${tourKey}`);
    if (!seen) {
      const timer = setTimeout(() => {
        setActive(true);
        setCurrent(0);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tourKey, steps.length]);

  // Allow manual trigger via context
  useEffect(() => {
    if (activeTourKey === tourKey) {
      setActive(true);
      setCurrent(0);
    }
  }, [activeTourKey, tourKey]);

  // Core measurement function: reads viewport rect and computes tooltip placement
  const measure = useCallback(() => {
    if (!active || steps.length === 0) return;
    const step = steps[current];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) {
      setTargetRect(null);
      setPlacement(null);
      return;
    }

    const rect = getViewportRect(el);
    setTargetRect(rect);

    const tooltipW = tooltipRef.current?.offsetWidth ?? 320;
    const tooltipH = tooltipRef.current?.offsetHeight ?? 160;
    setPlacement(calcTooltipPlacement(rect, step.position ?? "bottom", tooltipW, tooltipH));
  }, [active, current, steps]);

  // When step changes: scroll target into view, then measure
  useEffect(() => {
    if (!active) return;
    const step = steps[current];
    if (!step) return;

    let cancelled = false;

    const el = document.querySelector(step.target);
    if (el) {
      scrollTargetIntoView(el).then(() => {
        if (!cancelled) measure();
      });
    } else {
      // Element not found yet — retry a few times (it may render async)
      let retries = 0;
      const interval = setInterval(() => {
        retries++;
        const found = document.querySelector(step.target);
        if (found) {
          clearInterval(interval);
          scrollTargetIntoView(found).then(() => {
            if (!cancelled) measure();
          });
        } else if (retries >= 10) {
          clearInterval(interval);
          // Skip this step if target never appears
          if (!cancelled) measure();
        }
      }, 200);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    return () => { cancelled = true; };
  }, [active, current, steps, measure]);

  // Listen to scroll events on ALL scroll ancestors + window resize
  useEffect(() => {
    if (!active) return;
    const step = steps[current];
    if (!step) return;
    const el = document.querySelector(step.target);

    const throttledMeasure = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    // Scroll listeners on all scrollable ancestors
    const scrollAncestors = el ? getScrollAncestors(el) : [];
    for (const ancestor of scrollAncestors) {
      ancestor.addEventListener("scroll", throttledMeasure, { passive: true });
    }
    // Also listen on window for resize + any window-level scroll
    window.addEventListener("resize", throttledMeasure);
    window.addEventListener("scroll", throttledMeasure, true);

    // ResizeObserver on the target element for layout shifts
    let resizeObs: ResizeObserver | undefined;
    if (el) {
      resizeObs = new ResizeObserver(throttledMeasure);
      resizeObs.observe(el);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const ancestor of scrollAncestors) {
        ancestor.removeEventListener("scroll", throttledMeasure);
      }
      window.removeEventListener("resize", throttledMeasure);
      window.removeEventListener("scroll", throttledMeasure, true);
      resizeObs?.disconnect();
    };
  }, [active, current, steps, measure]);

  // Re-measure after tooltip renders (its size affects placement)
  useEffect(() => {
    if (!targetRect || !active) return;
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [targetRect, active, measure]);

  // Keyboard support
  useEffect(() => {
    if (!active) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, current, steps.length]);

  function finish() {
    localStorage.setItem(`closr-tour-${tourKey}`, "1");
    setActive(false);
    setTargetRect(null);
    setPlacement(null);
    onComplete?.();
  }

  function goNext() {
    if (current < steps.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      finish();
    }
  }

  function goPrev() {
    if (current > 0) {
      setCurrent((c) => c - 1);
    }
  }

  if (!active || steps.length === 0) return null;

  // Spotlight highlight rect (viewport-relative, fixed positioning)
  const spotlightStyle: React.CSSProperties = targetRect
    ? {
        position: "fixed",
        top: targetRect.top - PADDING,
        left: targetRect.left - PADDING,
        width: targetRect.width + PADDING * 2,
        height: targetRect.height + PADDING * 2,
        borderRadius: 12,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
        pointerEvents: "none",
        transition: "all 300ms ease-in-out",
        zIndex: 300,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        width: 0,
        height: 0,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
        pointerEvents: "none",
        zIndex: 300,
      };

  const step = steps[current];

  const tooltipStyle: React.CSSProperties = placement
    ? { position: "fixed", top: placement.top, left: placement.left, width: placement.width, zIndex: 301 }
    : { position: "fixed", top: 0, left: 0, opacity: 0, zIndex: 301 };

  return createPortal(
    <div
      className="fixed inset-0 z-[299]"
      style={{ pointerEvents: "auto" }}
      onClick={finish}
    >
      {/* Spotlight hole */}
      <div style={spotlightStyle} />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        className="max-w-[340px] rounded-xl border border-border bg-card p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">{step.title}</h3>
          <button
            onClick={finish}
            className="rounded-md p-1 text-secondary hover:bg-background hover:text-foreground transition-colors"
            aria-label={en ? "Close tour" : "关闭引导"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Content */}
        <p className="text-[13px] leading-relaxed text-secondary">
          {step.content}
        </p>

        {/* Footer: step count + nav */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted">
            {current + 1} / {steps.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={finish}
              className="rounded-md px-2.5 py-1.5 text-xs text-secondary hover:text-foreground transition-colors"
            >
              {en ? "Skip" : "跳过"}
            </button>
            {current > 0 && (
              <button
                onClick={goPrev}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors"
              >
                <ChevronLeft className="h-3 w-3" />
                {en ? "Previous" : "上一步"}
              </button>
            )}
            <button
              onClick={goNext}
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              {current < steps.length - 1 ? (
                <>
                  {en ? "Next" : "下一步"}
                  <ChevronRight className="h-3 w-3" />
                </>
              ) : (
                en ? "Done" : "完成"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Reset all tours ────────────────────────────────────────────────

export function resetAllTours() {
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (key.startsWith("closr-tour-")) {
      localStorage.removeItem(key);
    }
  }
}
