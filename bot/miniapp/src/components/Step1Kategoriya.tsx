import { motion } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya' | 'ichki_sotuv'

interface Props {
  onTanla: (tur: Tur) => void
}

const KATEGORIYALAR: {
  tur: Tur
  emoji: string
  nomi: string
  tavsif: string
  color: string
  full?: boolean
  disabled?: boolean
}[] = [
  {
    tur: 'vozvrat',
    emoji: '♻️',
    nomi: 'Qayta ishlash',
    tavsif: 'Qayta ishlab sotuvga chiqarilgan mahsulot',
    color: '#3B82F6',
  },
  {
    tur: 'kafe',
    emoji: '☕',
    nomi: 'Kafe',
    tavsif: 'Kafe uchun sarflangan mahsulot',
    color: '#F59E0B',
  },
  {
    tur: 'ovqatlanish',
    emoji: '🍽️',
    nomi: 'Ovqatlanish',
    tavsif: 'Xodimlar ovqatlanishi uchun',
    color: '#10B981',
    full: true,
  },
  {
    tur: 'spisaniya',
    emoji: '🗑️',
    nomi: 'Spisaniya',
    tavsif: 'Yaroqsiz tovar hisobdan chiqarish',
    color: '#EF4444',
    full: true,
  },
  {
    tur: 'ichki_sotuv',
    emoji: '🏷️',
    nomi: 'Ichki sotuv',
    tavsif: 'Ichki sotuvga chiqarilgan mahsulot',
    color: '#8B5CF6',
    full: true,
  },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 340, damping: 28 } },
}

export default function Step1Kategoriya({ onTanla }: Props) {
  const { user, haptic } = useTelegram()

  function handleTanla(tur: Tur) {
    haptic?.impactOccurred('light')
    onTanla(tur)
  }

  return (
    <div className="flex flex-col min-h-screen px-4 pt-8 pb-6 bg-tg-bg">
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <p className="text-[13px] font-medium text-tg-hint mb-1.5">
          Salom, {user?.first_name ?? 'xodim'} 👋
        </p>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.5px] text-tg-text">
          Qanday yozuv<br />qo'shmoqchisiz?
        </h1>
      </motion.div>

      <motion.div
        className="grid grid-cols-2 gap-3 flex-1"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {KATEGORIYALAR.map((k) => (
          <motion.button
            key={k.tur}
            variants={item}
            whileTap={k.disabled ? {} : { scale: 0.96 }}
            onClick={() => !k.disabled && handleTanla(k.tur)}
            disabled={k.disabled}
            className={[
              'relative rounded-3xl p-4 text-left border',
              'flex shadow-sm transition-shadow duration-150',
              k.full
                ? 'col-span-2 flex-row items-center gap-4 py-4'
                : 'flex-col justify-between min-h-[148px]',
              k.disabled ? 'opacity-40 cursor-not-allowed' : 'active:shadow-none',
            ].join(' ')}
            style={{
              background: `linear-gradient(135deg, ${k.color}12 0%, ${k.color}06 100%)`,
              borderColor: k.color + '22',
            }}
          >
            {k.full ? (
              <>
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: k.color + '18' }}
                >
                  <span className="text-[22px] leading-none">{k.emoji}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-tg-text leading-tight">{k.nomi}</span>
                  <span className="block text-[12px] text-tg-hint mt-0.5 leading-snug">{k.tavsif}</span>
                </div>
                <div
                  className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: k.color + '15' }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7h8M8 4l3 3-3 3" stroke={k.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: k.color + '18' }}
                  >
                    <span className="text-[22px] leading-none">{k.emoji}</span>
                  </div>
                  {k.disabled ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/8 text-tg-hint">
                      Tez kunda
                    </span>
                  ) : (
                  <div
                    className="w-7 h-7 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: k.color + '15' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7h8M8 4l3 3-3 3" stroke={k.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  )}
                </div>
                <div>
                  <span className="block text-[15px] font-bold text-tg-text leading-tight">{k.nomi}</span>
                  <span className="block text-[12px] text-tg-hint mt-1 leading-snug">{k.tavsif}</span>
                </div>
              </>
            )}
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
