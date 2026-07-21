interface TelegramWebAppUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

interface TelegramBackButton {
  show(): void
  hide(): void
  onClick(cb: () => void): void
  offClick(cb: () => void): void
}

type TelegramEvent = 'viewportChanged' | 'themeChanged'

/**
 * Hodisa parametrlari. `viewportChanged` animatsiyaning HAR kadrida keladi va
 * `isStateStable: false` bo'ladi — yakuniy o'lcham faqat `true` da ma'lum.
 * Eski mijozlar parametrni umuman bermasligi mumkin, shuning uchun ixtiyoriy.
 */
interface TelegramEventParams {
  isStateStable?: boolean
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: TelegramWebAppUser }
  ready(): void
  expand(): void
  // Joriy ko'rinadigan balandlik — klaviatura ochilganda kichrayadi
  viewportHeight?: number
  colorScheme?: 'light' | 'dark'
  onEvent?(event: TelegramEvent, cb: (params: TelegramEventParams) => void): void
  offEvent?(event: TelegramEvent, cb: (params: TelegramEventParams) => void): void
  // Native "orqaga" tugmasi — eski mijozlarda bo'lmasligi mumkin
  BackButton?: TelegramBackButton
  // Bot API 7.7+ — eski mijozlarda yo'q, shuning uchun ixtiyoriy
  disableVerticalSwipes?(): void
  isVersionAtLeast?(version: string): boolean
  close(): void
  // Bot API 6.2+ — BackButton kabi eski mijozlarda yo'q, shuning uchun ixtiyoriy
  enableClosingConfirmation?(): void
  disableClosingConfirmation?(): void
  setHeaderColor(color: string): void
  showAlert(message: string, callback?: () => void): void
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
}

declare global {
  interface Window {
    Telegram: { WebApp: TelegramWebApp }
  }
}

export {}
