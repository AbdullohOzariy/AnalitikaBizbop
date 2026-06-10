import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// supplier.oilagroup.uz — faqat yetkazib beruvchi anketasi: barcha yo'llar /anketa'ga
// rewrite qilinadi (asosiy ERP bu domenda ko'rinmaydi). Auth talab qilinmaydi
// (auth.config'da supplier.* host public deb belgilangan).
export default auth((req) => {
  const host = req.headers.get("host") ?? "";
  if (host.startsWith("supplier.")) {
    const url = req.nextUrl;
    if (!url.pathname.startsWith("/anketa")) {
      const u = url.clone();
      u.pathname = "/anketa";
      return NextResponse.rewrite(u);
    }
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
