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
import { OnecShopEditor } from "./onec-shop-editor";
import { TolovTuriEditor } from "./tolov-turi-editor";
import { OnecIpEditor } from "./onec-ip-editor";
import { OnecImzoEditor } from "./onec-imzo-editor";
import { HMAC_REQUIRED_KEY } from "@/lib/integratsiya/imzo";
import { RuxsatEditor } from "./ruxsat-editor";
import { SverkaGuruhEditor } from "./sverka-guruh-editor";
import { SverkaXodimlar, type XodimRow } from "../../sverka/sverka-client";
import { SverkaTopiklarEditor, type SverkaTopicRow } from "./sverka-topiklar-editor";
import { SverkaQabulchiEditor, type QabulchiRow } from "./sverka-qabulchi-editor";
import { InventoryReportEditor } from "./inventory-report-editor";
import { getInventoryReportConfig } from "@/lib/inventory-report/sozlama";
import { MarginReportEditor } from "./margin-report-editor";
import { getMarginReportConfig } from "@/lib/margin-report/sozlama";
import { StockdayReportEditor } from "./stockday-report-editor";
import { getStockdayReportConfig } from "@/lib/stockday-report/sozlama";
import { DeliveryAlertEditor } from "./delivery-alert-editor";
import { ExpiryAlertEditor } from "./expiry-alert-editor";
import { PromoAlertEditor } from "./promo-alert-editor";
import { getDeliveryAlertConfig } from "@/lib/delivery-alert/sozlama";
import { getExpiryAlertConfig } from "@/lib/expiry-alert/sozlama";
import { getPromoAlertConfig } from "@/lib/promo-alert/sozlama";
import { ZakazPdfEditor } from "./zakaz-pdf-editor";
import { getZakazPdfConfig } from "@/lib/zakaz-pdf/sozlama";
import { SpisaniyaDailyEditor } from "./spisaniya-daily-editor";
import { getSpisaniyaDailyConfig } from "@/lib/spisaniya-daily/sozlama";
import { NarxReportEditor } from "./narx-report-editor";
import { getNarxReportConfig, getNarxReportLastPeriod } from "@/lib/narx-report/sozlama";
import { formatDateUZ } from "@/lib/format";

type Tab = "spisaniya" | "sverka" | "inventarizatsiya" | "marja" | "yetkazish" | "zakaz" | "spdaily" | "narx" | "zaxira";

export default async function SozlamalarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.roles.includes("SYSTEM_ADMIN")) redirect("/dashboard");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "sverka" ? "sverka" : sp.tab === "inventarizatsiya" ? "inventarizatsiya" : sp.tab === "marja" ? "marja" : sp.tab === "yetkazish" ? "yetkazish" : sp.tab === "zakaz" ? "zakaz" : sp.tab === "spdaily" ? "spdaily" : sp.tab === "narx" ? "narx" : sp.tab === "zaxira" ? "zaxira" : "spisaniya";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Settings}
        title="Sozlamalar"
        description="Loyihaning umumiy sozlamalari"
      />

      {/* Tablar: Spisaniya / Sverka */}
      {/* flex-wrap — tablar soni 8 ta bo'ldi, tor ekranda toshib ketmasin */}
      <div role="tablist" className="flex flex-wrap gap-2">
        {([
          { v: "spisaniya", l: "Spisaniya sozlamalari" },
          { v: "sverka", l: "Sverka sozlamalari" },
          { v: "inventarizatsiya", l: "Inventarizatsiya" },
          { v: "marja", l: "Marja" },
          { v: "yetkazish", l: "Yetkazish kechikishi" },
          { v: "zakaz", l: "Zakaz PDF" },
          { v: "spdaily", l: "Spisaniya kunlik" },
          { v: "narx", l: "Filiallar narxi" },
          { v: "zaxira", l: "Zaxira normasi" },
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

      {tab === "spisaniya" ? <SpisaniyaTab /> : tab === "sverka" ? <SverkaTab /> : tab === "inventarizatsiya" ? <InventarizatsiyaTab /> : tab === "marja" ? <MarjaTab /> : tab === "yetkazish" ? <YetkazishTab /> : tab === "zakaz" ? <ZakazTab /> : tab === "narx" ? <NarxTab /> : tab === "zaxira" ? <ZaxiraTab /> : <SpisaniyaDailyTab />}
    </div>
  );
}

// ─── Filiallar narx farqi hisoboti (kunlik PDF) ────────────────────────────────

async function NarxTab() {
  const [cfg, lastPeriod] = await Promise.all([
    getNarxReportConfig(),
    getNarxReportLastPeriod(),
  ]);
  return (
    <div className="space-y-5">
      <SectionCard
        title="Filiallar narx farqi hisoboti"
        description="Har kuni 11:00 (Toshkent) — bir xil SKU filiallarda 5% dan ko'proq farqli narxda sotilsa PDF"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        {/* lastPeriod serverda formatlanadi — client'da toLocaleDateString hydration farqini beradi */}
        <NarxReportEditor
          tokenSet={!!cfg.token}
          chatId={cfg.chatId ?? ""}
          topicId={cfg.topicId != null ? String(cfg.topicId) : ""}
          autoEnabled={cfg.autoEnabled}
          lastPeriod={lastPeriod ? formatDateUZ(lastPeriod) : null}
        />
      </SectionCard>
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
  const [cfg, expCfg, promoCfg] = await Promise.all([
    getDeliveryAlertConfig(),
    getExpiryAlertConfig(),
    getPromoAlertConfig(),
  ]);
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

      <SectionCard
        title="Muddat (yaroqlilik) signali"
        description="Har kuni 10:30 (Toshkent) — muddati o'tgan va kritik (≤3 kun) partiyalar"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <ExpiryAlertEditor
          tokenSet={!!expCfg.token}
          chatId={expCfg.chatId ?? ""}
          topicId={expCfg.topicId != null ? String(expCfg.topicId) : ""}
          autoEnabled={expCfg.autoEnabled}
        />
      </SectionCard>

      <SectionCard
        title="Aksiya signali"
        description="Har kuni 08:00 (Toshkent) — bugun boshlanadigan va tugaydigan aksiyalar"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <PromoAlertEditor
          tokenSet={!!promoCfg.token}
          chatId={promoCfg.chatId ?? ""}
          topicId={promoCfg.topicId != null ? String(promoCfg.topicId) : ""}
          autoEnabled={promoCfg.autoEnabled}
        />
      </SectionCard>
    </div>
  );
}

// ─── Zaxira normasi xabarnoma bot ─────────────────────────────────────────────

async function ZaxiraTab() {
  const [cfg, normaSoni] = await Promise.all([
    getStockdayReportConfig(),
    prisma.stockdayLimit.count().catch(() => 0),
  ]);
  return (
    <div className="space-y-5">
      <SectionCard
        title="Zaxira normasi xabarnoma bot"
        description="Normadan oshgan tovarlar (SKU × filial) Excel'i — ortiqcha kapital bo'yicha saralangan"
        actions={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
      >
        <StockdayReportEditor
          tokenSet={!!cfg.token}
          chatId={cfg.chatId ?? ""}
          topicId={cfg.topicId != null ? String(cfg.topicId) : ""}
          autoEnabled={cfg.autoEnabled}
          excludeCodes={cfg.excludeCodes.join(", ")}
          normaSoni={normaSoni}
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
    prisma.branch.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        chiqimFilial: true,
        onecShopId: true,
        _count: { select: { receipts: true } },
      },
    }),
    chiqimFilials(),
    adminKategoriyaDaraxt(),
    botUserBiriktirmalar(),
  ]);

  // Cheklarda uchragan, lekin hech bir filialga biriktirilmagan 1C do'konlari —
  // "shop 7 dan 340 chek kelyapti, lekin u qaysi filial?" degan savolni ochadi.
  const shopStats = await prisma.receipt.groupBy({
    by: ["shop"],
    where: { branchId: null },
    _count: true,
    orderBy: { _count: { shop: "desc" } },
    take: 20,
  });
  const bogliqsizShoplar = shopStats.map((r) => ({ shop: r.shop, soni: r._count }));

  // To'lov turlari — nom bo'yicha hajm bilan (tasdiqlash muhimligini ko'rsatadi)
  const [tolovTurlari, tolovStats] = await Promise.all([
    prisma.paymentTypeMap.findMany({ orderBy: [{ isConfirmed: "asc" }, { name: "asc" }] }),
    prisma.receiptPayment.groupBy({ by: ["name"], _count: true, _sum: { value: true } }),
  ]);
  const tolovHajm = new Map(
    tolovStats.map((t) => [t.name, { soni: t._count, summa: Number(t._sum.value ?? 0) }])
  );

  // 1C qabul IP'lari — ruxsat berilgani ham, rad etilgani ham
  const [ipLog, ipSetting, imzoSetting] = await Promise.all([
    prisma.onecIpLog.findMany({ orderBy: { lastSeen: "desc" }, take: 30 }),
    prisma.appSetting.findUnique({ where: { key: "onec_allowed_ips" } }),
    prisma.appSetting.findUnique({ where: { key: HMAC_REQUIRED_KEY } }),
  ]);
  const ruxsatEtilganIp = (ipSetting?.value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  // Imzo statistikasi FAQAT ruxsat etilgan IP'lar bo'yicha: rad etilgan
  // skanerlarning imzosiz urinishlari "1C imzolamayapti" degan noto'g'ri
  // xulosaga olib kelmasin.
  const imzoLog = ipLog.filter((r) => ruxsatEtilganIp.includes(r.ip));
  const imzoStat = {
    jami: imzoLog.reduce((s, r) => s + r.requests, 0),
    imzolangan: imzoLog.reduce((s, r) => s + r.signedRequests, 0),
  };

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
        title="1C qabul: IP cheklovi"
        description="Ma'lumot qaysi IP'dan kelayotgani. Birinchi so'rov avtomatik ro'yxatga olinadi"
        actions={<Link2 className="h-4 w-4 text-muted-foreground" />}
      >
        <OnecIpEditor
          rows={ipLog.map((r) => ({
            ip: r.ip,
            allowed: r.allowed,
            requests: r.requests,
            firstSeen: formatDateUZ(r.firstSeen),
            lastSeen: formatDateUZ(r.lastSeen),
          }))}
          ruxsatEtilgan={ruxsatEtilganIp}
        />
      </SectionCard>

      <SectionCard
        title="1C qabul: imzo (HMAC)"
        description="So'rov haqiqiyligini tasdiqlash. HTTP orqali qabul qilishda shart"
        actions={<Link2 className="h-4 w-4 text-muted-foreground" />}
      >
        <OnecImzoEditor
          majburiy={imzoSetting?.value === "1"}
          sirSozlangan={Boolean(process.env.ONEC_INGEST_SECRET)}
          jami={imzoStat.jami}
          imzolangan={imzoStat.imzolangan}
        />
      </SectionCard>

      <SectionCard
        title="To'lov turlari (1C)"
        description="Chekdagi to'lov nomi → naqd / plastik / o'tkazma. Tushum shu bo'yicha bo'linadi"
        actions={<Link2 className="h-4 w-4 text-muted-foreground" />}
      >
        <TolovTuriEditor
          rows={tolovTurlari.map((t) => ({
            id: t.id,
            name: t.name,
            kind: t.kind,
            isConfirmed: t.isConfirmed,
            soni: tolovHajm.get(t.name)?.soni ?? 0,
            summa: tolovHajm.get(t.name)?.summa ?? 0,
          }))}
        />
      </SectionCard>

      <SectionCard
        title="1C do'koni → filial"
        description="Chekdagi `shop` raqami qaysi filial ekani (1C integratsiyasi)"
        actions={<Link2 className="h-4 w-4 text-muted-foreground" />}
      >
        <OnecShopEditor
          branches={branches.map((b) => ({
            id: b.id,
            name: b.name,
            onecShopId: b.onecShopId,
            chekSoni: b._count.receipts,
          }))}
          bogliqsizShoplar={bogliqsizShoplar}
        />
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
