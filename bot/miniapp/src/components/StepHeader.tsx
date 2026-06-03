import { ChevronLeft } from 'lucide-react'
import { cn } from '../lib/utils'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya' | 'ichki_sotuv'

const TUR_DOT: Record<Tur | 'tasdiq', string> = {
  vozvrat:     '#3B82F6',
  kafe:        '#F59E0B',
  ovqatlanish: '#10B981',
  spisaniya:   '#EF4444',
  ichki_sotuv: '#8B5CF6',
  tasdiq:      '#10B981',
}

const TUR_LABEL: Record<Tur | 'tasdiq', string> = {
  vozvrat:     'Qayta ishlash',
  kafe:        'Kafe',
  ovqatlanish: 'Ovqatlanish',
  spisaniya:   'Spisaniya',
  ichki_sotuv: 'Ichki sotuv',
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
    <div className="sticky top-0 z-10 bg-tg-bg/90 backdrop-blur-md border-b border-black/[.05] px-4 h-14 flex items-center gap-3">
      <button
        onClick={onBack}
        className="w-8 h-8 rounded-xl bg-tg-bg2 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0 border border-black/[.05]"
      >
        <ChevronLeft className="w-4 h-4 text-tg-text" strokeWidth={2.5} />
      </button>

      {/* Progress dots */}
      <div className="flex items-center gap-1.5 flex-1">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-1.5 flex-1 last:flex-none">
            <div
              className={cn(
                'h-1.5 rounded-full transition-all duration-300 flex-shrink-0',
                n <= step ? 'w-4' : 'w-1.5 bg-black/10'
              )}
              style={n <= step ? { backgroundColor: color } : {}}
            />
            {n < 3 && (
              <div className={cn(
                'flex-1 h-[2px] rounded-full transition-colors duration-300',
                n < step ? 'opacity-100' : 'bg-black/8 opacity-100'
              )}
              style={n < step ? { backgroundColor: color + '40' } : {}}
              />
            )}
          </div>
        ))}
      </div>

      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold flex-shrink-0"
        style={{ backgroundColor: color + '15', color }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        {TUR_LABEL[tur]}
      </div>
    </div>
  )
}
