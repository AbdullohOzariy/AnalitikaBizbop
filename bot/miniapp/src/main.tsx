import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Telegram WebApp init — birinchi bo'yashdan OLDIN.
// Bot odatda /miniapp/kirish orqali ochadi (u yerda expand bor), lekin to'g'ridan-to'g'ri
// kirish yo'llari ham bor — idempotent mudofaa. expand()siz compact rejim qoladi va
// Step1 kesiladi; disableVerticalSwipes() tasodifiy svayp bilan yopilishni to'sadi.
const tg = window.Telegram?.WebApp
tg?.ready()
tg?.expand()
if (tg?.isVersionAtLeast?.('7.7')) tg.disableVerticalSwipes?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
