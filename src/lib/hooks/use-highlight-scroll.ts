'use client';

import { useEffect, useRef } from 'react';

/**
 * Auto-scroll to and briefly highlight an element identified by
 * `[data-highlight-id="${targetId}"]`.
 *
 * Returns a helper `highlightProps(itemId)` that components should
 * spread onto each list item's container element.
 */
export function useHighlightScroll(targetId: string | null | undefined) {
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (!targetId || fired.current === targetId) return;

    // Delay slightly so the DOM has rendered after tab switch.
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-highlight-id="${CSS.escape(targetId)}"]`);
      if (!el) return;
      fired.current = targetId;

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-flash');

      const cleanup = setTimeout(() => el.classList.remove('highlight-flash'), 2200);
      return () => clearTimeout(cleanup);
    }, 300);

    return () => clearTimeout(timer);
  }, [targetId]);

  /** Spread onto each item container: `<div {...highlightProps(item.id)}>` */
  function highlightProps(itemId: string) {
    return { 'data-highlight-id': itemId } as const;
  }

  return { highlightProps };
}
