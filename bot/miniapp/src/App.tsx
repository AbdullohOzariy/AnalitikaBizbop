import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShieldAlert, Loader2, WifiOff, RotateCw } from 'lucide-react'
import Step1Kategoriya from './components/Step1Kategoriya'
import Step2Forma from './components/Step2Forma'
import Step3Tasdiq from './components/Step3Tasdiq'
import Step4Muvaffaqiyat from './components/Step4Muvaffaqiyat'
import type { FormData } from './components/Step2Forma'
import { boshFormData } from './lib/forma'
import { qoralamaOqi, qoralamaSaqla, qoralamaTozala, qoralamaArziydi, type Qoralama } from './lib/draft'
import { useTelegram } from './hooks/useTelegram'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya' | 'ichki_sotuv' | 'qaytarish'
type Step = 1 | 2 | 3 | 4
// 'denied' — server ataylab rad etdi ({allowed:false}); 'xato' — ulanib bo'lmadi
type Gate = 'checking' | 'allowed' | 'denied' | 'xato'

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
}

const transition = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.9 }

export default function App() {
  const { initData, user } = useTelegram()
  const [gate, setGate] = useState<Gate>('checking')
  const [urinish, setUrinish] = useState(0)
  const [step, setStep] = useState<Step>(1)
  const [dir, setDir] = useState(1)
  const [tur, setTur] = useState<Tur>('spisaniya')
  // Forma holati App'da: Step3 → "Orqaga" da Step2Forma unmount bo'ladi, holat esa qoladi
  const [form, setForm] = useState<FormData>(boshFormData)
  // Ochilishda topilgan tugallanmagan yozuv (effekt emas — set-state-in-effect'dan qochish)
  const [taklif, setTaklif] = useState<Qoralama | null>(() => qoralamaOqi())

  // Ochilishda ruxsatni tekshiramiz (Telegram imzosi orqali server tomonda).
  useEffect(() => {
    let bekor = false
    fetch('/api/ruxsat', { method: 'POST', headers: { 'x-telegram-init-data': initData } })
      .then((r) => {
        // Status tekshiruvi SHART: 429 rate-limit ham to'g'ri shakldagi {allowed:false}
        // qaytaradi va tekshirilmasa xodimga "Ruxsat yo'q" bo'lib ko'rinardi.
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (bekor) return
        const viaKirish = new URLSearchParams(window.location.search).has('via')
        if (d?.allowed) {
          // Ikkala rol ham bor va to'g'ridan-to'g'ri ochilgan (BotFather "Open") —
          // tanlov ekraniga yuboramiz; kirish sahifasidan kelgan bo'lsa (?via) qolamiz
          if (d?.sverka && !viaKirish) {
            window.location.replace('/miniapp/kirish' + window.location.hash)
            return
          }
          setGate('allowed')
          return
        }
        // Spisaniya ruxsati yo'q, lekin SVERKA roli bor — o'sha appga o'tamiz
        if (d?.sverka) { window.location.replace('/miniapp/sverka' + window.location.hash); return }
        // Bu yerga faqat JSON o'qilgan va allowed=false bo'lganda tushamiz — haqiqiy rad etish
        setGate('denied')
      })
      // Tarmoq uzilishi, 5xx HTML javob, JSON parse xatosi — ruxsat masalasi EMAS
      .catch(() => { if (!bekor) setGate('xato') })
    return () => { bekor = true }
  }, [initData, urinish])

  // Qoralamani localStorage'ga yozamiz (300ms debounce). Rasm saqlanmaydi — qarang lib/draft.ts
  //
  // DIQQAT: bu yerda "arzimasa o'chir" shoxi YO'Q va bo'lmasligi kerak. 2-qadamga endi
  // o'tilganda forma bo'sh bo'ladi — o'chirish shoxi aynan o'sha payt saqlangan
  // qoralamani jimgina yo'q qilardi. O'chirish faqat aniq hodisalarda:
  // handleYuborildi / handleReset / qoralamaniTashla.
  useEffect(() => {
    if (gate !== 'allowed') return
    if (step !== 2 && step !== 3) return
    if (!qoralamaArziydi(form)) return
    const t = setTimeout(() => qoralamaSaqla(tur, form), 300)
    return () => clearTimeout(t)
  }, [gate, step, tur, form])

  if (gate === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tg-bg text-brand">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    )
  }

  if (gate === 'xato') {
    return (
      <div className="min-h-screen bg-tg-bg flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-tg-bg2 border border-line flex items-center justify-center">
          <WifiOff className="w-8 h-8 text-tg-hint" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display text-[19px] font-extrabold tracking-[-0.3px] text-tg-text">Ulanib bo&apos;lmadi</h1>
          <p className="text-[14px] leading-relaxed text-tg-hint">
            Internet yoki server bilan aloqa yo&apos;q. Bir oz kutib, qayta urinib ko&apos;ring.
          </p>
        </div>
        <button
          onClick={() => { setGate('checking'); setUrinish(n => n + 1) }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-tg-bg2 border border-line text-[14px] font-semibold text-tg-btn active:opacity-70"
        >
          <RotateCw className="w-4 h-4" />
          Qayta urinish
        </button>
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
          <h1 className="font-display text-[19px] font-extrabold tracking-[-0.3px] text-tg-text">Ruxsat yo&apos;q</h1>
          <p className="text-[14px] leading-relaxed text-tg-hint">
            Botdan foydalanish uchun admindan ruxsat oling.
          </p>
        </div>
        {user?.id != null && (
          <div className="bg-tg-bg2 border border-line rounded-xl px-4 py-2.5">
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
    // Taklifni yopamiz: xodim bannerni e'tiborsiz qoldirib yangi ish boshladi. Aks holda
    // "Orqaga" bosilganda eski banner qayta chiqib, "Davom etish" hozirgina kiritilgan
    // ma'lumotni ogohlantirishsiz almashtirardi.
    setTaklif(null)
    // TUR o'zgarsa forma tozalanadi. Forma holati App'ga ko'tarilgach (Step3 →
    // "Orqaga" da yo'qolmasligi uchun) u endi Step1'ga qaytganda ham tirik qoladi —
    // ya'ni tur almashtirilsa oldingi turning ma'lumoti, jumladan RASMI, yangi
    // yozuvga ko'chib o'tardi. Ayni tur qayta tanlansa saqlab qolamiz: xodim
    // tasodifan "Orqaga" bosib qaytgan bo'lishi mumkin.
    if (t !== tur) setForm(boshFormData())
    setTur(t)
    goTo(2)
  }

  function handleYuborildi() {
    qoralamaTozala()
    setTaklif(null)
    goTo(4)
  }

  function handleReset() {
    qoralamaTozala()
    setTaklif(null)
    setForm(boshFormData())
    goTo(1)
  }

  function qoralamaniTikla() {
    if (!taklif) return
    setTur(taklif.tur)
    // Rasm saqlanmagan — shuning uchun har doim 2-qadamga qaytamiz, 3-qadamga emas
    setForm({ ...boshFormData(), ...taklif.form })
    setTaklif(null)
    setDir(1)
    setStep(2)
  }

  function qoralamaniTashla() {
    qoralamaTozala()
    setTaklif(null)
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
            {/* Banner fixed va pastki plitkalarni bosadi — Step1 scrolliga joy qo'shamiz */}
            <Step1Kategoriya onTanla={handleTanla} bannerJoyi={taklif !== null} />
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
              form={form}
              setForm={setForm}
              onBack={() => goTo(1)}
              onNext={() => goTo(3)}
            />
          </motion.div>
        )}

        {step === 3 && (
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
              form={form}
              onBack={() => goTo(2)}
              onDone={handleYuborildi}
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

      {/* Tugallanmagan yozuv taklifi — faqat boshlang'ich ekranda */}
      <AnimatePresence>
        {taklif && step === 1 && (
          <motion.div
            key="qoralama"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring' as const, stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
          >
            <div className="bg-tg-bg2 border border-line rounded-2xl shadow-lg px-4 py-3.5">
              <p className="text-[14px] font-semibold text-tg-text">Tugallanmagan yozuv bor</p>
              <p className="mt-1 text-[12.5px] leading-snug text-tg-hint">
                {taklif.form.tovarNomi.trim() || 'Nomsiz tovar'}
                {taklif.photoBor && ' — rasmni qayta qo\'shishingiz kerak'}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={qoralamaniTashla}
                  className="flex-1 px-3 py-2 rounded-xl bg-tg-bg border border-line text-[13px] font-semibold text-tg-hint active:opacity-70"
                >
                  Tashlab yuborish
                </button>
                <button
                  onClick={qoralamaniTikla}
                  className="flex-1 px-3 py-2 rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 text-white text-[13px] font-bold shadow-sm active:opacity-90"
                >
                  Davom etish
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
