import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useTelegram } from '../hooks/useTelegram'
import { Button } from './ui/Button'

interface Props {
  onYangi: () => void
}

export default function Step4Muvaffaqiyat({ onYangi }: Props) {
  const { tg, haptic } = useTelegram()

  useEffect(() => {
    haptic?.notificationOccurred('success')
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-tg-bg text-center">

      {/* Icon */}
      <div className="relative mb-7">
        <motion.div
          className="absolute inset-0 rounded-full bg-[#10B981]/15"
          animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring' as const, stiffness: 260, damping: 20 }}
          className="relative w-20 h-20 rounded-full bg-[#10B981] flex items-center justify-center shadow-[0_8px_30px_rgba(16,185,129,.30)]"
        >
          <Check className="w-9 h-9 text-white" strokeWidth={2.5} />
        </motion.div>
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-[22px] font-bold tracking-[-0.3px] text-tg-text mb-2"
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
        <Button onClick={onYangi}>
          Yangi yozuv qo'shish
        </Button>
        <Button variant="secondary" onClick={() => tg?.close()}>
          Yopish
        </Button>
      </motion.div>
    </div>
  )
}
