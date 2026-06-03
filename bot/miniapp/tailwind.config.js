/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Display/headings — Sora; body — Telegram-native system stack.
        display: ['Sora', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // Telegram temasiga moslashadigan yuzalar (light/dark avtomatik)
        tg: {
          bg:       'var(--tg-theme-bg-color, #F2F3F7)',
          bg2:      'var(--tg-theme-secondary-bg-color, #FFFFFF)',
          text:     'var(--tg-theme-text-color, #0B0B0F)',
          hint:     'var(--tg-theme-hint-color, #8A8A8E)',
          link:     'var(--tg-theme-link-color, #1FBF5C)',
          btn:      'var(--tg-theme-button-color, #1FBF5C)',
          'btn-txt':'var(--tg-theme-button-text-color, #FFFFFF)',
        },
        // BizBop brend (emerald) — temadan qat'i nazar barqaror
        brand: {
          DEFAULT: '#1FBF5C',
          50:  '#E9FBF1',
          100: '#CFF6E0',
          400: '#3DD17A',
          500: '#1FBF5C',
          600: '#15A34A',
          700: '#0F7D39',
        },
        line: 'var(--hairline)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '26px',
      },
      boxShadow: {
        'brand': '0 8px 24px -6px rgba(31,191,92,.40)',
        'brand-lg': '0 14px 40px -8px rgba(31,191,92,.45)',
        'soft': '0 4px 18px -4px rgba(15,23,42,.10)',
        'card': '0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.10)',
      },
      animation: {
        'pop-in':  'popIn .45s cubic-bezier(.34,1.56,.64,1) both',
        'fade-up': 'fadeUp .22s cubic-bezier(.25,.46,.45,.94) both',
        'pulse-ring': 'pulseRing 2.4s ease-out infinite',
        'spin-slow': 'spin .7s linear infinite',
        'shimmer': 'shimmer 1.4s linear infinite',
      },
      keyframes: {
        popIn:     { from: { transform: 'scale(.3)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
        fadeUp:    { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        pulseRing: {
          '0%':   { transform: 'scale(.8)', opacity: '0' },
          '30%':  { opacity: '1' },
          '100%': { transform: 'scale(1.15)', opacity: '0' },
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
}
