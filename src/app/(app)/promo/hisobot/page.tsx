import { redirect } from "next/navigation";
import { BarChart2 } from "lucide-react";
import { auth } from "@/auth";
import { canSeePromo } from "@/lib/roles";
import { PageHeader } from "@/components/common/page";
import { HisobotClient } from "./hisobot-client";

export const metadata = { title: "Promo hisobot" };

export default async function PromoHisobotPage() {
  const session = await auth();
  if (!session?.user || !canSeePromo(session.user.roles)) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Promo hisobot"
        description="Aksiya samaradorligi — sotuv o'sishi va narx asliga qaytganini kuzatish"
        icon={BarChart2}
      />
      <HisobotClient />
    </div>
  );
}
