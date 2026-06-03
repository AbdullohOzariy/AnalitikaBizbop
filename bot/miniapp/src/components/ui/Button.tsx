import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'lg', children, ...props }, ref) => {
    const brandCta =
      'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-brand ' +
      'hover:shadow-brand-lg disabled:shadow-none'
    return (
      <button
        ref={ref}
        className={cn(
          'relative flex items-center justify-center gap-2 font-semibold rounded-2xl select-none',
          'transition-all duration-150 active:scale-[.97] disabled:opacity-40 disabled:cursor-not-allowed',
          (variant === 'primary' || variant === 'success') && brandCta,
          variant === 'secondary' && 'bg-tg-bg2 text-tg-text border border-line',
          variant === 'ghost'     && 'bg-transparent text-tg-hint hover:text-tg-text',
          size === 'sm' && 'text-[13px] px-4 py-2',
          size === 'md' && 'text-[14px] px-5 py-2.5',
          size === 'lg' && 'w-full text-[15.5px] py-[15px] tracking-[-0.2px]',
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
