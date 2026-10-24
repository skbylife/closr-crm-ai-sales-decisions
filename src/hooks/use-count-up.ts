'use client'

import { useEffect, useRef, useState } from 'react'

interface UseCountUpOptions {
  duration?: number
  delay?: number
  enabled?: boolean
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

export function useCountUp(target: number, options?: UseCountUpOptions) {
  const { duration = 800, delay = 0, enabled = true } = options ?? {}
  const [current, setCurrent] = useState(() => (!enabled || target === 0 ? target : 0))
  const rafRef = useRef<number>(0)
  const syncFrameRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (syncFrameRef.current) cancelAnimationFrame(syncFrameRef.current)

    if (!enabled || target === 0) {
      syncFrameRef.current = requestAnimationFrame(() => {
        setCurrent(target)
        syncFrameRef.current = 0
      })

      return () => {
        if (syncFrameRef.current) cancelAnimationFrame(syncFrameRef.current)
      }
    }

    const timeoutId = setTimeout(() => {
      startTimeRef.current = 0
      setCurrent(0)

      const animate = (timestamp: number) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp
        const elapsed = timestamp - startTimeRef.current
        const progress = Math.min(elapsed / duration, 1)
        const easedProgress = easeOutExpo(progress)

        setCurrent(easedProgress * target)

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate)
        } else {
          setCurrent(target)
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }, delay)

    return () => {
      clearTimeout(timeoutId)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (syncFrameRef.current) cancelAnimationFrame(syncFrameRef.current)
    }
  }, [target, duration, delay, enabled])

  return current
}

/** Parse a display value like '$125,000' or '68%' or '3.2x' into parts */
export function parseDisplayValue(value: string | number): {
  numericValue: number
  prefix: string
  suffix: string
  decimals: number
  isNumeric: boolean
} {
  if (typeof value === 'number') {
    return { numericValue: value, prefix: '', suffix: '', decimals: 0, isNumeric: true }
  }

  // Match: optional prefix (non-digit, non-dot, non-comma chars), number (with commas/dots), optional suffix
  const match = value.match(/^([^0-9]*?)([\d,]+\.?\d*)(.*?)$/)
  if (!match) {
    return { numericValue: 0, prefix: '', suffix: '', decimals: 0, isNumeric: false }
  }

  const prefix = match[1]
  const numStr = match[2].replace(/,/g, '')
  const suffix = match[3]
  const numericValue = parseFloat(numStr)
  const dotIndex = numStr.indexOf('.')
  const decimals = dotIndex === -1 ? 0 : numStr.length - dotIndex - 1

  if (isNaN(numericValue)) {
    return { numericValue: 0, prefix: '', suffix: '', decimals: 0, isNumeric: false }
  }

  return { numericValue, prefix, suffix, decimals, isNumeric: true }
}
