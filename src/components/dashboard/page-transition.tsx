'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef, type ReactNode } from 'react';

/**
 * Wraps page content with a smooth fade+slide transition on route change.
 * Uses CSS transitions (no external lib) with a brief opacity dip.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [displayChildren, setDisplayChildren] = useState(children);
  const prevPathname = useRef(pathname);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Same route — just update children (e.g. search params change)
    if (pathname === prevPathname.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync children on same-route update
      setDisplayChildren(children);
      return;
    }

    // Route changed — trigger exit → swap → enter
    prevPathname.current = pathname;

    // Phase 1: fade out
    setIsVisible(false);

    // Phase 2: swap content after exit animation
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDisplayChildren(children);
      // Force browser to paint before fade-in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    }, 120); // match CSS exit duration

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pathname, children]);

  return (
    <div
      className="page-transition-wrapper"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: isVisible
          ? 'opacity 220ms cubic-bezier(0.16, 1, 0.3, 1)'
          : 'opacity 100ms ease-out',
      }}
    >
      {displayChildren}
    </div>
  );
}
