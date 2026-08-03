import Script from "next/script";
import type { Viewport } from "next";
import { MoliyaApp } from "./moliya-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Kassa — BizBop",
};

/** `resizes-content` — summa kiritishda klaviatura ochilganda pastdagi
 *  "Saqlash" tugmasi uning ostida qolib ketmasin (sverka miniapp naqshi). */
export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/** Telegram Mini App — kassa kirim/chiqim (public, initData bilan himoyalanadi). */
export default function MoliyaMiniAppPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <MoliyaApp />
    </>
  );
}
