import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  label?: string
}

export function Card({ className, label, children, ...props }: CardProps) {
  return (
    <div
      className={cn('bg-tg-bg2 rounded-2xl border border-line p-[14px] shadow-card', className)}
      {...props}
    >
      {label && (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.6px] text-tg-hint">
          {label}
        </p>
      )}
      {children}
    </div>
  )
}
