'use client'

import { useCountUp } from '@/hooks/use-count-up'

interface AnimatedNumberProps {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
  delay?: number
  className?: string
  useThousandsSeparator?: boolean
}

export function AnimatedNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration,
  delay,
  className,
  useThousandsSeparator = true,
}: AnimatedNumberProps) {
  const current = useCountUp(value, { duration, delay })

  const formatted = useThousandsSeparator
    ? current.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : current.toFixed(decimals)

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{formatted}{suffix}
    </span>
  )
}
