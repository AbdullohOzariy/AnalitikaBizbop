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
          // ghost matni --ink-2 da, --tg-hint da EMAS: `lg` o'lchamda ham 15.5px —
          // WCAG "large text" emas, ya'ni 4.5:1 kerak. --tg-hint (#8A8A8E) fonda
          // atigi ~3.1:1 berardi, `hover:` esa sensorli ekranda hech qachon ishlamaydi.
          variant === 'ghost'     && 'bg-transparent text-ink2 hover:text-tg-text',
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
