import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: boolean;
  hover?: boolean;
}

export function Card({
  padding = true,
  hover = false,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`card-elevated rounded-xl border border-border bg-card ${padding ? "p-5" : ""} ${hover ? "card-hover" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
