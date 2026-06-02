import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  label?: string
}

export function Card({ className, label, children, ...props }: CardProps) {
  return (
    <div
      className={cn('bg-tg-bg2 rounded-2xl p-[14px]', className)}
      {...props}
    >
      {label && (
        <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-tg-hint mb-2">
          {label}
        </p>
      )}
      {children}
    </div>
  )
}
