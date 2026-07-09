import Link from "next/link";
import { isoDay } from "@/lib/date";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  botConfigured,
  filialarToliq,
  chiqimFilials,
  guruhChatIdOl,
  ruxsatList,
} from "@/lib/spisaniya/db";
import { adminKategoriyaDaraxt, botUserBiriktirmalar } from "@/lib/spisaniya/sku-scope";
import { getSverkaGroupChatId } from "@/lib/sverka/sozlama";
import { Settings, WifiOff, Building2, MessageSquare, Users, Link2 } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { GuruhEditor } from "./guruh-editor";
import { FilialarEditor } from "./filialar-editor";
import { ChiqimFilialEditor } from "./chiqim-filial-editor";
import { RuxsatEditor } from "./ruxsat-editor";
import { SverkaGuruhEditor } from "./sverka-guruh-editor";
import { SverkaXodimlar, type XodimRow } from "../../sverka/sverka-client";
import { SverkaTopiklarEditor, type SverkaTopicRow } from "./sverka-topiklar-editor";
import { SverkaQabulchiEditor, type QabulchiRow } from "./sverka-qabulchi-editor";
import { InventoryReportEditor } from "./inventory-report-editor";
import { getInventoryReportConfig } from "@/lib/inventory-report/sozlama";
import { MarginReportEditor } from "./margin-report-editor";
import { getMarginReportConfig } from "@/lib/margin-report/sozlama";
import { DeliveryAlertEditor } from "./delivery-alert-editor";
import { getDeliveryAlertConfig } from "@/lib/delivery-alert/sozlama";
import { ZakazPdfEditor } from "./zakaz-pdf-editor";
import { getZakazPdfConfig } from "@/lib/zakaz-pdf/sozlama";
import { SpisaniyaDailyEditor } from "./spisaniya-daily-editor";
import { getSpisaniyaDailyConfig } from "@/lib/spisaniya-daily/sozlama";

type Tab = "spisaniya" | "sverka" | "inventarizatsiya" | "marja" | "yetkazish" | "zakaz" | "spdaily";

export default async function SozlamalarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.roles.includes("SYSTEM_ADMIN")) redirect("/dashboard");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "sverka" ? "sverka" : sp.tab === "inventarizatsiya" ? "inventarizatsiya" : sp.tab === "marja" ? "marja" : sp.tab === "yetkazish" ? "yetkazish" : sp.tab === "zakaz" ? "zakaz" : sp.tab === "spdaily" ? "spdaily" : "spisaniya";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Settings}
        title="Sozlamalar"
        description="Loyihaning umumiy sozlamalari"
      />

      {/* Tablar: Spisaniya / Sverka */}
      <div role="tablist" className="flex gap-2">
        {([
          { v: "spisaniya", l: "Spisaniya sozlamalari" },
          { v: "sverka", l: "Sverka sozlamalari" },
          { v: "inventarizatsiya", l: "Inventarizatsiya" },
          { v: "marja", l: "Marja" },
          { v: "yetkazish", l: "Yetkazish kechikishi" },
          { v: "zakaz", l: "Zakaz PDF" },
          { v: "spdaily", l: "Spisaniya kunlik" },
        ] as { v: Tab; l: string }[]).map((t) => (
          <Link
            key={t.v}
            href={`/admin/sozlamalar?tab=${t.v}`}
            scroll={false}
            aria-current={tab === t.v ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-xl border px-4 text-sm font-medium transition-colors",
              tab === t.v
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            {t.l}
          </Link>
        ))}
      </div>

      {tab === "spisaniya" ? <SpisaniyaTab /> : tab === "sverka" ? <SverkaTab /> : tab === "inventarizatsiya" ? <InventarizatsiyaTab /> : tab === "marja" ? <MarjaTab /> : tab === "yetkazish" ? <YetkazishTab /> : tab === "zakaz" ? <ZakazTab /> : <SpisaniyaDailyTab />}
    </div>
  );
}

// ─── Spisaniya kunlik indikator hisoboti (eng xavfli subkat + filial) ─────────

async function SpisaniyaDailyTab() {
  const cfg = await getSpisaniyaDailyConfig();
  return (
    <div className="space-y-5">
      <SectionCard
        title="Spisaniya kunlik indikator boti"
        description="Har kuni 09:30 (Toshkent) — kechagi kun bo'yicha eng xavfli subkategoriya va filial"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <SpisaniyaDailyEditor
          tokenSet={!!cfg.token}
          chatId={cfg.chatId ?? ""}
          topicId={cfg.topicId != null ? String(cfg.topicId) : ""}
          autoEnabled={cfg.autoEnabled}
        />
      </SectionCard>
    </div>
  );
}

// ─── Zakaz PDF (qabul qilinganda nakladnoy Telegram guruhga) ──────────────────

async function ZakazTab() {
  const cfg = await getZakazPdfConfig();
  return (
    <div className="space-y-5">
      <SectionCard
        title="Zakaz nakladnoy (PDF) bot"
        description="Zakaz 'Zakaz qabul qilindi' holatiga o'tganda nakladnoy PDF sifatida guruh topigiga yuboriladi"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <ZakazPdfEditor
          tokenSet={!!cfg.token}
          chatId={cfg.chatId ?? ""}
          topicId={cfg.topicId != null ? String(cfg.topicId) : ""}
          autoEnabled={cfg.autoEnabled}
        />
      </SectionCard>
    </div>
  );
}

// ─── Yetkazib berish kechikishi signali ───────────────────────────────────────

async function YetkazishTab() {
  const cfg = await getDeliveryAlertConfig();
  return (
    <div className="space-y-5">
      <SectionCard
        title="Yetkazib berish kechikishi signali"
        description="Har kuni 10:00 (Toshkent) — kutilgan sanadan o'tib ketgan, hali kelmagan zakazlar ro'yxati"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <DeliveryAlertEditor
          tokenSet={!!cfg.token}
          chatId={cfg.chatId ?? ""}
          topicId={cfg.topicId != null ? String(cfg.topicId) : ""}
          autoEnabled={cfg.autoEnabled}
        />
      </SectionCard>
    </div>
  );
}

// ─── Marja minus xabarnoma bot ────────────────────────────────────────────────

async function MarjaTab() {
  const cfg = await getMarginReportConfig();
  return (
    <div className="space-y-5">
      <SectionCard
        title="Marja xabarnoma bot"
        description="Oxirgi davr — marjasi 15% dan past mahsulotlar + subkat marja vs reja Excel'i"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <MarginReportEditor
          tokenSet={!!cfg.token}
          chatId={cfg.chatId ?? ""}
          topicId={cfg.topicId != null ? String(cfg.topicId) : ""}
          autoEnabled={cfg.autoEnabled}
        />
      </SectionCard>
    </div>
  );
}

// ─── Inventarizatsiya xabarnoma bot ───────────────────────────────────────────

async function InventarizatsiyaTab() {
  const cfg = await getInventoryReportConfig();
  return (
    <div className="space-y-5">
      <SectionCard
        title="Inventarizatsiya xabarnoma bot"
        description="Har kuni 14:00 (Toshkent) — qoldig'i 0/minus, sotuvi bor muammoli tovarlar Excel'i"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <InventoryReportEditor
          tokenSet={!!cfg.token}
          chatId={cfg.chatId ?? ""}
          topicId={cfg.topicId != null ? String(cfg.topicId) : ""}
        />
      </SectionCard>
    </div>
  );
}

// ─── Spisaniya sozlamalari (avvalgi tarkib, o'zgarmagan) ──────────────────────

async function SpisaniyaTab() {
  if (!botConfigured()) {
    return (
      <EmptyState
        icon={WifiOff}
        title="Bot bazasiga ulanmagan"
        description="BOT_DATABASE_URL muhit o'zgaruvchisi sozlanmagan."
      />
    );
  }
  const [filialar, chatId, ruxsatlar, branches, bizbopFilials, katDaraxt, biriktirmalar] = await Promise.all([
    filialarToliq(),
    guruhChatIdOl(),
    ruxsatList(),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, chiqimFilial: true } }),
    chiqimFilials(),
    adminKategoriyaDaraxt(),
    botUserBiriktirmalar(),
  ]);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Bot foydalanuvchilari"
        description={`${ruxsatlar.length} ta · faqat ruxsat berilganlar botdan foydalanadi`}
        actions={<Users className="h-4 w-4 text-muted-foreground" />}
      >
        <RuxsatEditor ruxsatlar={ruxsatlar} daraxt={katDaraxt} biriktirmalar={biriktirmalar} />
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

      <SectionCard
        title="Chiqim filialiga bog'lash"
        description="Analitika filiali → bizbop chiqim filiali (Foyda hisobotidagi chiqim shu nom bo'yicha olinadi)"
        actions={<Link2 className="h-4 w-4 text-muted-foreground" />}
      >
        <ChiqimFilialEditor branches={branches} bizbopFilials={bizbopFilials} />
      </SectionCard>
    </div>
  );
}

// ─── Sverka sozlamalari ───────────────────────────────────────────────────────

async function SverkaTab() {
  const [chatId, xodimlar, filialar, qabulchilar] = await Promise.all([
    getSverkaGroupChatId(),
    prisma.sverkaXodim.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sverkaTopicId: true } }),
    prisma.sverkaQabulchi.findMany({ orderBy: { ism: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Telegram guruh (Sverka)"
        description="To'ldirilgan sverkalar yuboriladigan guruh"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <SverkaGuruhEditor initial={chatId ?? ""} />
      </SectionCard>

      <SectionCard
        title="Filial topiklari"
        description={`${filialar.length} ta filial · sverka to'g'ri topikka borishi uchun`}
        actions={<Building2 className="h-4 w-4 text-muted-foreground" />}
      >
        <SverkaTopiklarEditor
          filialar={filialar.map((f): SverkaTopicRow => ({ id: f.id, name: f.name, topicId: f.sverkaTopicId }))}
        />
      </SectionCard>

      <SectionCard
        title="Qabul qiluvchilar"
        description={`${qabulchilar.length} ta · mini app'dagi "Qabul qildi" tanlovi`}
        actions={<Users className="h-4 w-4 text-muted-foreground" />}
      >
        <SverkaQabulchiEditor qabulchilar={qabulchilar.map((q): QabulchiRow => ({ id: q.id, ism: q.ism }))} />
      </SectionCard>

      <SverkaXodimlar
        xodimlar={xodimlar.map((x): XodimRow => ({
          id: x.id,
          tgUserId: String(x.tgUserId),
          ism: x.ism,
          createdAt: isoDay(x.createdAt),
        }))}
      />
    </div>
  );
}
