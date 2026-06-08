import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  botConfigured,
  filialarToliq,
  guruhChatIdOl,
  ruxsatList,
} from "@/lib/spisaniya/db";
import { Settings, WifiOff, Building2, Send, MessageSquare, Users } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/common/page";
import { GuruhEditor } from "./guruh-editor";
import { FilialarEditor } from "./filialar-editor";
import { RuxsatEditor } from "./ruxsat-editor";

export default async function SozlamalarPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "SYSTEM_ADMIN") redirect("/dashboard");

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Settings}
        title="Sozlamalar"
        description="Loyihaning umumiy sozlamalari"
      />

      {/* ─── Telegram / Hisobdan chiqarish ─── */}
      <div className="flex items-center gap-2 pt-1">
        <Send className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Telegram bot — Hisobdan chiqarish</h2>
      </div>

      {!botConfigured() ? (
        <EmptyState
          icon={WifiOff}
          title="Bot bazasiga ulanmagan"
          description="BOT_DATABASE_URL muhit o'zgaruvchisi sozlanmagan."
        />
      ) : (
        <SettingsBody />
      )}

      {/* Kelajakda boshqa sozlama bo'limlari shu yerga qo'shiladi. */}
    </div>
  );
}

async function SettingsBody() {
  const [filialar, chatId, ruxsatlar] = await Promise.all([
    filialarToliq(),
    guruhChatIdOl(),
    ruxsatList(),
  ]);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Bot foydalanuvchilari"
        description={`${ruxsatlar.length} ta · faqat ruxsat berilganlar botdan foydalanadi`}
        actions={<Users className="h-4 w-4 text-muted-foreground" />}
      >
        <RuxsatEditor ruxsatlar={ruxsatlar} />
      </SectionCard>

      <SectionCard
        title="Telegram guruh"
        description="Yangi yozuvlar yuboriladigan guruh"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <GuruhEditor initial={chatId} />
      </SectionCard>

      <SectionCard
        title="Filiallar"
        description={`${filialar.length} ta · guruh topiklariga ulash`}
        actions={<Building2 className="h-4 w-4 text-muted-foreground" />}
      >
        <FilialarEditor filialar={filialar} />
      </SectionCard>
    </div>
  );
}
