import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'lg', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'flex items-center justify-center gap-2 font-semibold rounded-2xl transition-all duration-150 active:scale-[.97] disabled:opacity-40 disabled:cursor-not-allowed select-none',
          variant === 'primary'   && 'bg-tg-btn text-tg-btn-txt',
          variant === 'secondary' && 'bg-tg-bg2 text-tg-text border border-black/[.07]',
          variant === 'ghost'     && 'bg-transparent text-tg-hint',
          variant === 'success'   && 'bg-[#10B981] text-white shadow-[0_4px_20px_rgba(16,185,129,.25)]',
          size === 'sm' && 'text-[13px] px-4 py-2',
          size === 'md' && 'text-[14px] px-5 py-2.5',
          size === 'lg' && 'w-full text-[15px] py-[14px] tracking-[-0.1px]',
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
