import Script from "next/script";
import type { Viewport } from "next";
import { LogistikaApp } from "./logistika-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reys — BizBop",
};

/**
 * `viewportFit: "cover"` SHART: usiz `env(safe-area-inset-*)` spec bo'yicha
 * 0 qaytaradi va pastki qotirilgan panellar (`.bar`, `.yukbar`) iPhone
 * home-indicator zonasi ostiga tushadi — ya'ni 68px "Yetib bordim" va 76px
 * yuk chiplarining kattaligi aynan o'sha ekranlarda foyda bermay qoladi.
 * `interactiveWidget` — sotuv/sverka bilan bir xil naqsh.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/** Telegram Mini App — haydovchi reysi (public, initData bilan himoyalanadi). */
export default function LogistikaMiniAppPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <LogistikaApp />
    </>
  );
}
