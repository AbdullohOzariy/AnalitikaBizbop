/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        tg: {
          bg:       'var(--tg-theme-bg-color, #F2F3F7)',
          bg2:      'var(--tg-theme-secondary-bg-color, #FFFFFF)',
          text:     'var(--tg-theme-text-color, #111111)',
          hint:     'var(--tg-theme-hint-color, #8A8A8E)',
          link:     'var(--tg-theme-link-color, #2196F3)',
          btn:      'var(--tg-theme-button-color, #2196F3)',
          'btn-txt':'var(--tg-theme-button-text-color, #FFFFFF)',
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
      animation: {
        'pop-in':  'popIn .45s cubic-bezier(.34,1.56,.64,1) both',
        'fade-up': 'fadeUp .22s cubic-bezier(.25,.46,.45,.94) both',
        'pulse-ring': 'pulseRing 2.4s ease-out infinite',
        'spin-slow': 'spin .7s linear infinite',
      },
      keyframes: {
        popIn:     { from: { transform: 'scale(.3)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
        fadeUp:    { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        pulseRing: {
          '0%':   { transform: 'scale(.8)', opacity: '0' },
          '30%':  { opacity: '1' },
          '100%': { transform: 'scale(1.15)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}

