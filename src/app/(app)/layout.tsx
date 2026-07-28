import { after } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PageMotionWrapper } from "./page-motion-wrapper";
import { touchAccess } from "@/lib/access-log/log";
import { FaollikPing } from "@/components/layout/faollik-ping";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Kirishlar jurnali — faollik oynasini uzaytiramiz (Tizim → Kirishlar).
  // `after` javob yuborilgandan KEYIN ishlaydi, ya'ni sahifa tezligiga ta'sir
  // qilmaydi. Ichida `headers()`/`cookies()` CHAQIRILMAYDI — Server Component'da
  // bu runtime xato beradi (Next 16); jurnalga so'rov sarlavhasi kerak ham emas.
  const { id: uid, name: uname } = session.user;
  after(() => {
    touchAccess({ surface: "WEB", userId: Number(uid), actorName: uname ?? null });
  });

  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar role={session.user.role} roles={session.user.roles} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={session.user} />
        <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 bg-muted/30 min-w-0">
          <PageMotionWrapper>{children}</PageMotionWrapper>
        </main>
        {/* Sessiya davomiyligini o'lchash uchun jim signal — layout SPA
            navigatsiyasida qayta render bo'lmaydi, shuning uchun kerak. */}
        <FaollikPing />
      </div>
    </div>
  );
}
