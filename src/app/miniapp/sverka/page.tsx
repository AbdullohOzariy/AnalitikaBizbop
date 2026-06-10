import Script from "next/script";
import { SverkaApp } from "./sverka-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sverka — BizBop",
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
