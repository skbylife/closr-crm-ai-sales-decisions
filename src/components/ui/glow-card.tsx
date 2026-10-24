'use client';

import { ReactNode } from 'react';

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  /** When true (default), glow only appears on hover */
  hover?: boolean;
}

export function GlowCard({ children, className = '', hover = true }: GlowCardProps) {
  return (
    <div className={`glow-border ${hover ? 'glow-border-hover-only' : ''} ${className}`}>
      <div className="glow-border-inner">
        {children}
      </div>
    </div>
  );
}
