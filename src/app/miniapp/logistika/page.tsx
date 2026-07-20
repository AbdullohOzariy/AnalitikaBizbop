import Script from "next/script";
import { LogistikaApp } from "./logistika-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reys — BizBop",
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
