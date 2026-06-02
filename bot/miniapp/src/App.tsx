import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Step1Kategoriya from './components/Step1Kategoriya'
import Step2Forma from './components/Step2Forma'
import Step3Tasdiq from './components/Step3Tasdiq'
import Step4Muvaffaqiyat from './components/Step4Muvaffaqiyat'
import type { FormData } from './components/Step2Forma'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya'
type Step = 1 | 2 | 3 | 4

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
}

const transition = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.9 }

export default function App() {
  const [step, setStep] = useState<Step>(1)
  const [dir, setDir] = useState(1)
  const [tur, setTur] = useState<Tur>('spisaniya')
  const [formData, setFormData] = useState<FormData | null>(null)

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
