import Script from "next/script";
import { KirishApp } from "./kirish-app";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BizBop — kirish",
};

/**
 * Mini App yagona kirish nuqtasi — rolga qarab avtomatik yo'naltiradi:
 * faqat spisaniya → spisaniya app; faqat sverka → sverka app;
 * ikkalasi → tanlov ekrani; hech biri → ID bilan "ruxsat oling" ekrani.
 */
export default function KirishPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <KirishApp />
    </>
  );
}
