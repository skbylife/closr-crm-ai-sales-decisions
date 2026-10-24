'use client'

import { type ReactNode } from 'react'
import { useInView } from '@/hooks/use-in-view'

type Direction = 'up' | 'down' | 'left' | 'right'

interface FadeInProps {
  children: ReactNode
  delay?: number
  direction?: Direction
  className?: string
}

const directionOffset: Record<Direction, string> = {
  up: 'translateY(20px)',
  down: 'translateY(-20px)',
  left: 'translateX(20px)',
  right: 'translateX(-20px)',
}

export function FadeIn({ children, delay = 0, direction = 'up', className }: FadeInProps) {
  const [ref, isInView, isReady] = useInView({ threshold: 0.1, once: true })
  const shouldAnimateIn = isReady && !isInView

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shouldAnimateIn ? 0 : 1,
        transform: shouldAnimateIn ? directionOffset[direction] : 'translate(0)',
        transition: `opacity 500ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 500ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}
