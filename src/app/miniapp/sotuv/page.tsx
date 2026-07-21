import Script from "next/script";
import type { Viewport } from "next";
import { SotuvApp } from "./sotuv-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BizbopSotuv — BizBop",
};

/**
 * `viewportFit: "cover"` SHART: usiz `env(safe-area-inset-*)` spec bo'yicha
 * har qanday brauzerda 0 qaytaradi va pastki panellar (tabbar/savebar)
 * iPhone home-indicator zonasi ostiga tushadi.
 * `interactiveWidget` — klaviatura ochilganda viewport'ni qisqartiradi, ya'ni
 * "Saqlash" tugmasi klaviatura ostida qolib ketmaydi.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/** Telegram Mini App — sotuv hisobot + inventarizatsiya (public, initData bilan himoyalanadi). */
export default function SotuvMiniAppPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <SotuvApp />
    </>
  );
}
