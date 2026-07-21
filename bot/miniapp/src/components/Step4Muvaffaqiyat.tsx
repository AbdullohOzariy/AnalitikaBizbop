import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useTelegram } from '../hooks/useTelegram'
import { Button } from './ui/Button'

interface Props {
  /** Boshqa tur tanlash — 1-qadamga */
  onYangi: () => void
  /** Shu turda yana qo'shish — to'g'ridan-to'g'ri 2-qadamga (asosiy harakat) */
  onYanaShuTurda: () => void
  turNomi: string
}

export default function Step4Muvaffaqiyat({ onYangi, onYanaShuTurda, turNomi }: Props) {
  const { tg, haptic } = useTelegram()

  useEffect(() => {
    haptic?.notificationOccurred('success')
  }, [])

  return (
    /* Tugmalar 2 → 3 ga o'sgach kontent iPhone SE'da (~460px) toshadi, App ildizi
       esa `overflow-hidden` — ya'ni "Yopish" ga umuman yetib bo'lmasdi. Scroll SHU
       yerda. Ichki `min-h-full` wrapper SHART: `justify-center` + `overflow-y-auto`
       to'g'ridan-to'g'ri qo'yilsa, toshgan kontentning TEPASI kesilib, scroll bilan
       ham ochilmaydi (flexbox markazlashtirish nuqsoni). */
    <div className="h-[var(--app-h)] overflow-y-auto bg-tg-bg">
      <div className="flex min-h-full flex-col items-center justify-center px-6 py-8 pb-[max(24px,env(safe-area-inset-bottom))] text-center">

        {/* Icon */}
        <div className="relative mb-7">
          <motion.div
            className="absolute inset-0 rounded-full bg-brand/15"
            animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring' as const, stiffness: 260, damping: 20 }}
            className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-600 shadow-brand-lg"
          >
            <Check className="h-9 w-9 text-white" strokeWidth={2.5} />
          </motion.div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-2 font-display text-[23px] font-extrabold tracking-[-0.4px] text-tg-text"
        >
          Muvaffaqiyatli yuborildi
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-[14px] text-tg-hint leading-relaxed max-w-[240px] mb-8"
        >
          Yozuv qabul qilindi va guruhga yuborildi
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full space-y-2"
        >
          {/* Asosiy harakat — SHU turda yana qo'shish. Xodim odatda bir smenada
              bir xil turdagi yozuvlarni ketma-ket kiritadi; "Yangi yozuv" 1-qadamga
              qaytarib, har safar bir xil turni qayta tanlashga majbur qilardi. */}
          <Button onClick={onYanaShuTurda}>
            {turNomi} — yana qo'shish
          </Button>
          <Button variant="secondary" onClick={onYangi}>
            Boshqa tur tanlash
          </Button>
          <Button variant="ghost" onClick={() => tg?.close()}>
            Yopish
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
