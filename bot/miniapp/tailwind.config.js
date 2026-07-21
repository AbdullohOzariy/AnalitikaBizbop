/**
 * Telegram temasidan keladigan rang uchun Tailwind rang-fabrikasi.
 *
 * NEGA FUNKSIYA, oddiy `'var(--tg-theme-bg-color, #fff)'` EMAS:
 * Tailwind v3 alpha modifikatorini (`/85`, `/60`, `/25`) qo'llash uchun rangni
 * parse qila olishi kerak. `var(...)` parse qilinmaydi → utility JIMGINA tashlanadi,
 * hech qanday CSS chiqmaydi. Natijada `bg-tg-bg/85` fonsiz header, `bg-tg-hint/25`
 * esa ko'rinmas nuqta berardi. Funksiya shaklida Tailwind bizga `opacityValue` beradi
 * va biz `color-mix()` orqali o'zimiz shaffoflik yasaymiz.
 *
 * Eski WebView'da (`color-mix` yo'q) e'lon yaroqsiz bo'lib tashlanadi — ya'ni
 * bugungi holatga qaytadi, REGRESSIYA emas. Shuning uchun KO'ZGA TASHLANADIGAN
 * joylar (StepHeader foni va qadam nuqtalari) alpha'ga emas, qattiq rangga tayanadi.
 */
const tgRang = (nom, zaxira) => ({ opacityValue }) => {
  // DIQQAT: Tailwind alpha'ni STRING sifatida uzatadi ('0.6'), modifikatorsiz
  // holatda esa CSS o'zgaruvchi matnini ('var(--tw-bg-opacity)'). Shuning uchun
  // `typeof === 'number'` tekshiruvi ISHLAMAYDI — Number() + isFinite kerak.
  const alpha = Number(opacityValue)
  return Number.isFinite(alpha) && alpha !== 1
    ? `color-mix(in srgb, var(${nom}, ${zaxira}) ${alpha * 100}%, transparent)`
    : `var(${nom}, ${zaxira})`
}

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
          bg:       tgRang('--tg-theme-bg-color', '#F2F3F7'),
          bg2:      tgRang('--tg-theme-secondary-bg-color', '#FFFFFF'),
          text:     tgRang('--tg-theme-text-color', '#0B0B0F'),
          hint:     tgRang('--tg-theme-hint-color', '#8A8A8E'),
          link:     tgRang('--tg-theme-link-color', '#1FBF5C'),
          btn:      tgRang('--tg-theme-button-color', '#1FBF5C'),
          'btn-txt':tgRang('--tg-theme-button-text-color', '#FFFFFF'),
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
        // Yorliq/chip matni: --tg-hint 11px uppercase'da AA dan o'tmaydi (3.44:1).
        // Qorong'iroq neytral token — index.css da light/dark uchun alohida.
        ink2: 'var(--ink-2)',
        // Faol bo'lmagan qadam nuqtasi — alpha'siz qattiq rang (yuqoridagi izohga qarang)
        dot: 'var(--dot)',
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
