'use client'

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AnimatedNumber } from "./animated-number";
import { parseDisplayValue } from "@/hooks/use-count-up";

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  trend?: { value: string; positive: boolean };
  subtext?: string;
  href?: string;
}

export function StatCard({ label, value, icon: Icon, iconBg, iconColor, trend, subtext, href }: StatCardProps) {
  const parsed = parseDisplayValue(value);

  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-secondary">{label}</p>
          <p className="mt-1.5 text-xl sm:text-[1.9rem] font-semibold leading-none text-foreground truncate" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {parsed.isNumeric ? (
              <AnimatedNumber
                value={parsed.numericValue}
                prefix={parsed.prefix}
                suffix={parsed.suffix}
                decimals={parsed.decimals}
              />
            ) : (
              value
            )}
          </p>
          {trend && (
            <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-border-subtle bg-background/80 px-2.5 py-1">
              <ArrowUpRight className={`h-3.5 w-3.5 ${trend.positive ? "text-positive" : "text-danger"}`} />
              <span className={`text-[13px] font-semibold ${trend.positive ? "text-positive" : "text-danger"}`}>
                {trend.value}
              </span>
            </div>
          )}
          {subtext && <p className="mt-0.5 text-[12px] text-secondary">{subtext}</p>}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-border-subtle ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="stat-card hover:shadow-md transition-shadow cursor-pointer">
        {content}
      </Link>
    );
  }

  return (
    <div className="stat-card">
      {content}
    </div>
  );
}
