import { ChevronLeft } from 'lucide-react'
import { cn } from '../lib/utils'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya' | 'ichki_sotuv' | 'qaytarish'

const TUR_DOT: Record<Tur | 'tasdiq', string> = {
  vozvrat:     '#3B82F6',
  kafe:        '#F59E0B',
  ovqatlanish: '#10B981',
  spisaniya:   '#EF4444',
  ichki_sotuv: '#8B5CF6',
  qaytarish:   '#06B6D4',
  tasdiq:      '#10B981',
}

const TUR_LABEL: Record<Tur | 'tasdiq', string> = {
  vozvrat:     'Qayta ishlash',
  kafe:        'Kafe',
  ovqatlanish: 'Ovqatlanish',
  spisaniya:   'Spisaniya',
  ichki_sotuv: 'Ichki sotuv',
  qaytarish:   'Vozvrat',
  tasdiq:      'Tekshirish',
}

interface Props {
  onBack: () => void
  step: 2 | 3
  tur: Tur | 'tasdiq'
}

export default function StepHeader({ onBack, step, tur }: Props) {
  const color = TUR_DOT[tur]
  return (
    /* DIQQAT: bu izohda Tailwind klass nomlarini TO'LIQ yozmang — content skaneri
       ularni haqiqiy klass deb o'qib, build'ga o'lik CSS qoidasi qo'shadi.
       Yarim-shaffof fon (bg-tg-bg + 85% alpha) va `backdrop-blur-xl` ATAYLAB
       olib tashlandi: rang `var()` bo'lgani
       uchun Tailwind alpha utility'sini umuman chiqarmasdi → header FONSIZ qolib,
       kontent uning ostidan o'tib ketardi. Ustiga header flex-sibling, scroll
       konteyner esa uning ukasi — ya'ni `sticky` baribir no-op, blur faqat har
       kadrda backdrop snapshot talab qilardi. Qattiq fon — to'g'ri va arzon. */
    <div className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-tg-bg px-4">
      <button
        onClick={onBack}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-line bg-tg-bg2 transition-transform active:scale-95"
      >
        <ChevronLeft className="h-4 w-4 text-tg-text" strokeWidth={2.5} />
      </button>

      {/* Progress dots */}
      <div className="flex flex-1 items-center gap-1.5">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-1.5 last:flex-none">
            {/* Hint rangiga 25%/20% alpha berilgan variantlar hech qanday CSS
                chiqarmasdi (var()+alpha) — nuqtalar va ulagichlar KO'RINMASDI.
                Endi qattiq `--dot` tokeni. */}
            <div
              className={cn(
                'h-1.5 flex-shrink-0 rounded-full transition-all duration-300',
                n <= step ? 'w-5' : 'w-1.5 bg-dot'
              )}
              style={n <= step ? { backgroundColor: color } : {}}
            />
            {n < 3 && (
              <div
                className={cn('h-[2px] flex-1 rounded-full transition-colors duration-300', n >= step && 'bg-dot')}
                style={n < step ? { backgroundColor: color + '50' } : {}}
              />
            )}
          </div>
        ))}
      </div>

      <div
        className="flex flex-shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-bold"
        style={{ backgroundColor: color + '1A', color }}
      >
        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {TUR_LABEL[tur]}
      </div>
    </div>
  )
}
