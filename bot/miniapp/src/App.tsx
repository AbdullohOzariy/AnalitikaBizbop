import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShieldAlert, Loader2 } from 'lucide-react'
import Step1Kategoriya from './components/Step1Kategoriya'
import Step2Forma from './components/Step2Forma'
import Step3Tasdiq from './components/Step3Tasdiq'
import Step4Muvaffaqiyat from './components/Step4Muvaffaqiyat'
import type { FormData } from './components/Step2Forma'
import { useTelegram } from './hooks/useTelegram'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya'
type Step = 1 | 2 | 3 | 4
type Gate = 'checking' | 'allowed' | 'denied'

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
}

const transition = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.9 }

export default function App() {
  const { initData, user } = useTelegram()
  const [gate, setGate] = useState<Gate>('checking')
  const [step, setStep] = useState<Step>(1)
  const [dir, setDir] = useState(1)
  const [tur, setTur] = useState<Tur>('spisaniya')
  const [formData, setFormData] = useState<FormData | null>(null)

  // Ochilishda ruxsatni tekshiramiz (Telegram imzosi orqali server tomonda).
  useEffect(() => {
    let bekor = false
    fetch('/api/ruxsat', { method: 'POST', headers: { 'x-telegram-init-data': initData } })
      .then((r) => r.json())
      .then((d) => { if (!bekor) setGate(d?.allowed ? 'allowed' : 'denied') })
      .catch(() => { if (!bekor) setGate('denied') })
    return () => { bekor = true }
  }, [initData])

  if (gate === 'checking') {
    return (
      <div className="min-h-screen bg-tg-bg flex items-center justify-center text-tg-hint">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (gate === 'denied') {
    return (
      <div className="min-h-screen bg-tg-bg flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-[17px] font-bold text-tg-text">Ruxsat yo&apos;q</h1>
          <p className="text-[14px] text-tg-hint leading-relaxed">
            Botdan foydalanish uchun admindan ruxsat oling.
          </p>
        </div>
        {user?.id != null && (
          <div className="bg-tg-bg2 border border-black/[.05] rounded-xl px-4 py-2.5">
            <span className="text-[12px] text-tg-hint">Sizning ID: </span>
            <span className="text-[14px] font-semibold text-tg-text font-mono select-all">{user.id}</span>
          </div>
        )}
        <p className="text-[12px] text-tg-hint">Shu ID&apos;ni adminga yuboring.</p>
      </div>
    )
  }

  function goTo(next: Step) {
    setDir(next > step ? 1 : -1)
    setStep(next)
  }

  function handleTanla(t: Tur) {
    setTur(t)
    goTo(2)
  }

  function handleForma(data: FormData) {
    setFormData(data)
    goTo(3)
  }

  function handleReset() {
    setFormData(null)
    goTo(1)
  }

  return (
    <div className="relative overflow-hidden min-h-screen bg-tg-bg">
      <AnimatePresence mode="wait" custom={dir}>
        {step === 1 && (
          <motion.div
            key="step1"
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            className="absolute inset-0"
          >
            <Step1Kategoriya onTanla={handleTanla} />
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            className="absolute inset-0"
          >
            <Step2Forma
              tur={tur}
              onBack={() => goTo(1)}
              onNext={handleForma}
            />
          </motion.div>
        )}

        {step === 3 && formData && (
          <motion.div
            key="step3"
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            className="absolute inset-0"
          >
            <Step3Tasdiq
              tur={tur}
              form={formData}
              onBack={() => goTo(2)}
              onDone={() => goTo(4)}
            />
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="step4"
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            className="absolute inset-0"
          >
            <Step4Muvaffaqiyat onYangi={handleReset} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
