import { motion } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya' | 'ichki_sotuv' | 'qaytarish'

interface Props {
  onTanla: (tur: Tur) => void
}

const KATEGORIYALAR: { tur: Tur; emoji: string; nomi: string; tavsif: string; color: string }[] = [
  { tur: 'spisaniya',   emoji: '🗑️', nomi: 'Spisaniya',     tavsif: 'Yaroqsiz tovar', color: '#EF4444' },
  { tur: 'qaytarish',   emoji: '🔁', nomi: 'Vozvrat',       tavsif: 'Firma / asosiy filialga', color: '#06B6D4' },
  { tur: 'vozvrat',     emoji: '♻️', nomi: 'Qayta ishlash', tavsif: 'Qayta sotuvga', color: '#3B82F6' },
  { tur: 'ichki_sotuv', emoji: '🏷️', nomi: 'Ichki sotuv',   tavsif: 'Ichki sotuvga', color: '#8B5CF6' },
  { tur: 'kafe',        emoji: '☕', nomi: 'Kafe',          tavsif: 'Kafe xarajati', color: '#F59E0B' },
  { tur: 'ovqatlanish', emoji: '🍽️', nomi: 'Ovqatlanish',   tavsif: 'Xodimlar ovqati', color: '#10B981' },
]

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 340, damping: 28 } },
}

export default function Step1Kategoriya({ onTanla }: Props) {
  const { user, haptic } = useTelegram()

  function handleTanla(tur: Tur) {
    haptic?.impactOccurred('light')
    onTanla(tur)
  }

  return (
    <div className="flex min-h-screen flex-col bg-tg-bg px-4 pb-6 pt-7">
      {/* Brend bar */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-7 flex items-center gap-2"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-brand">
          <span className="text-[14px]">🛒</span>
        </div>
        <span className="font-display text-[15px] font-extrabold tracking-[-0.3px] text-tg-text">BizBop</span>
        <span className="ml-auto text-[12px] font-medium text-tg-hint">
          {user?.first_name ?? 'Xodim'}
        </span>
      </motion.div>

      {/* Sarlavha */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="mb-6"
      >
        <h1 className="font-display text-[27px] font-extrabold leading-[1.1] tracking-[-0.8px] text-tg-text">
          Qanday yozuv<br />qo&apos;shmoqchisiz?
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tg-hint">
          Hisobdan chiqarish turini tanlang
        </p>
      </motion.div>

      {/* Tiles */}
      <motion.div className="grid flex-1 grid-cols-2 gap-3" variants={container} initial="hidden" animate="show">
        {KATEGORIYALAR.map((k) => (
          <motion.button
            key={k.tur}
            variants={item}
            whileTap={{ scale: 0.96 }}
            onClick={() => handleTanla(k.tur)}
            className="group relative flex min-h-[126px] flex-col justify-between overflow-hidden rounded-3xl border border-line p-3.5 text-left shadow-card transition-shadow active:shadow-none"
            style={{ background: `linear-gradient(150deg, ${k.color}14 0%, ${k.color}07 60%, transparent 100%)` }}
          >
            <div className="flex items-start justify-between">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm"
                style={{ backgroundColor: k.color + '22' }}
              >
                <span className="text-[24px] leading-none">{k.emoji}</span>
              </div>
              <div
                className="flex h-7 w-7 items-center justify-center rounded-xl transition-transform group-active:translate-x-0.5"
                style={{ backgroundColor: k.color + '1A' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8M8 4l3 3-3 3" stroke={k.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <div>
              <span className="block font-display text-[15.5px] font-bold leading-tight text-tg-text">{k.nomi}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-tg-hint">{k.tavsif}</span>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
