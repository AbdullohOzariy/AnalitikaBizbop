import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PageMotionWrapper } from "./page-motion-wrapper";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar role={session.user.role} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={session.user} />
        <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 bg-muted/30 min-w-0">
          <PageMotionWrapper>{children}</PageMotionWrapper>
        </main>
      </div>
    </div>
  );
}
