interface TelegramWebAppUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: TelegramWebAppUser }
  ready(): void
  expand(): void
  // Bot API 7.7+ — eski mijozlarda yo'q, shuning uchun ixtiyoriy
  disableVerticalSwipes?(): void
  isVersionAtLeast?(version: string): boolean
  close(): void
  enableClosingConfirmation(): void
  disableClosingConfirmation(): void
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
