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
    <div className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-tg-bg/85 px-4 backdrop-blur-xl">
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
            <div
              className={cn(
                'h-1.5 flex-shrink-0 rounded-full transition-all duration-300',
                n <= step ? 'w-5' : 'w-1.5 bg-tg-hint/25'
              )}
              style={n <= step ? { backgroundColor: color } : {}}
            />
            {n < 3 && (
              <div
                className={cn('h-[2px] flex-1 rounded-full transition-colors duration-300', n >= step && 'bg-tg-hint/20')}
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
