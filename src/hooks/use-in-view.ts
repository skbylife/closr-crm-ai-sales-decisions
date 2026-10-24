'use client'

import { useEffect, useRef, useState } from 'react'

interface UseInViewOptions {
  threshold?: number
  rootMargin?: string
  once?: boolean
  fallbackDelayMs?: number
}

export function useInView(options?: UseInViewOptions) {
  const { threshold = 0.1, rootMargin = '0px', once = true, fallbackDelayMs = 1200 } = options ?? {}
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const observerUnavailable = typeof window !== 'undefined' && typeof window.IntersectionObserver === 'undefined'
  const [isInView, setIsInView] = useState(() => reducedMotion || observerUnavailable)
  const [isReady, setIsReady] = useState(() => reducedMotion || observerUnavailable)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (typeof window === 'undefined') return

    if (reducedMotion || observerUnavailable) {
      return
    }

    const rect = el.getBoundingClientRect()
    const initiallyVisible = rect.top < window.innerHeight && rect.bottom > 0
    const readyFrame = requestAnimationFrame(() => {
      if (initiallyVisible) setIsInView(true)
      setIsReady(true)
    })

    let fallbackTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      setIsInView(true)
    }, fallbackDelayMs)

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          if (fallbackTimer) {
            clearTimeout(fallbackTimer)
            fallbackTimer = null
          }
          if (once) observer.unobserve(el)
        } else if (!once) {
          setIsInView(false)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(el)

    return () => {
      cancelAnimationFrame(readyFrame)
      observer.disconnect()
      if (fallbackTimer) clearTimeout(fallbackTimer)
    }
  }, [threshold, rootMargin, once, fallbackDelayMs, reducedMotion, observerUnavailable])

  return [ref, isInView, isReady] as const
}
