import Script from "next/script";
import type { Viewport } from "next";
import { SverkaApp } from "./sverka-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sverka — BizBop",
};

/**
 * `interactiveWidget: "resizes-content"` — sehrgarning 1/2/4-qadamlarida
 * klaviatura ochiq turganda qotirilgan "Keyingi →" tugmasi uning ostida
 * qolib ketardi; bu bitta e'lon BARCHA qadamlarni qamrab oladi.
 * `viewportFit: "cover"` — `env(safe-area-inset-bottom)` ishlashi uchun
 * (usiz spec bo'yicha 0, `.nav` home-indicator ostiga tushadi).
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/** Telegram Mini App — sverka kiritish (public, initData bilan himoyalanadi). */
export default function SverkaMiniAppPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <SverkaApp />
    </>
  );
}
