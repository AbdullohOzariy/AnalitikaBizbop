import Script from "next/script";
import { SotuvApp } from "./sotuv-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BizbopSotuv — BizBop",
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
