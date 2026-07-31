import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, TrendingUp, ShieldCheck, CircleSlash, History, AlertTriangle } from "lucide-react";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import { oxirgiRun, skuPrognoz, seriyaTarixi, bahoTarixi, type PrognozQator } from "@/lib/prognoz/oqish";
import { TarixChart } from "./tarix-chart";

const SINF_META: Record<string, { nom: string; izoh: string }> = {
  SMOOTH: { nom: "Barqaror", izoh: "Har hafta sotiladi, miqdor tekis — haftalik grafik ma'noli" },
  ERRATIC: { nom: "Notekis", izoh: "Har hafta sotiladi, lekin miqdor keskin o'zgaradi" },
  INTERMITTENT: {
    nom: "Siyrak",
    izoh: "Ba'zi haftalarda sotuv umuman yo'q — haftalik raqamga emas, 4 haftalik jamiga qarang",
  },
  LUMPY: {
    nom: "Siyrak + notekis",
    izoh: "Sotuv siyrak va miqdor keskin o'zgaradi — eng qiyin sinf, prognozga ehtiyot bo'ling",
  },
  KAM: { nom: "Tarix kam", izoh: "Model qurish uchun nolmas haftalar yetarli emas" },
};

const son = (n: number, x = 1) =>
  new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: x, maximumFractionDigits: x }).format(n);
const pc = (v: number | null, x = 0) => (v == null ? "—" : `${(v * 100).toFixed(x)}%`);

export default async function SkuPrognozPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeAnalytics(session.user.roles)) redirect("/dashboard");

  const { productId: pidStr } = await params;
  const productId = parseInt(pidStr);
  if (!Number.isFinite(productId)) notFound();

  const sp = await searchParams;
  const branchId = sp.branchId ? parseInt(sp.branchId) : undefined;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, code: true, name: true, abcClass: true, category: { select: { name: true } } },
  });
  if (!product) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        icon={TrendingUp}
        title={product.name}
        description={`Kod ${product.code}${product.category ? ` · ${product.category.name}` : ""}${
          product.abcClass ? ` · ABC ${product.abcClass}` : ""
        }`}
      >
        <Link
          href="/prognoz"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Ro'yxatga qaytish
        </Link>
      </PageHeader>

      <Suspense key={`${productId}|${branchId ?? "all"}`} fallback={<SkuSkeleton />}>
        <SkuData productId={productId} branchId={branchId} />
      </Suspense>
    </div>
  );
}

function SkuSkeleton() {
  return (
    <>
      <Skeleton className="h-10 w-80 rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </>
  );
}

async function SkuData({ productId, branchId }: { productId: number; branchId?: number }) {
  const run = await oxirgiRun();
  if (!run) return <EmptyState icon={TrendingUp} title="Prognoz hali hisoblanmagan" />;

  const qatorlar = await skuPrognoz(run.id, productId);
  if (qatorlar.length === 0) {
    return (
      <EmptyState
        icon={CircleSlash}
        title="Bu SKU uchun prognoz yo'q"
        description="Sabab: tarix yetarli emas (KAM sinf), SKU arxivlangan, yoki oynada umuman sotuv bo'lmagan."
      />
    );
  }

  const tanlangan = qatorlar.find((r) => r.branchId === branchId) ?? qatorlar[0];

  return (
    <>
      {/* Filial tanlash — SKU bir necha filialda, har birida talab boshqacha */}
      <div className="flex flex-wrap gap-2">
        {qatorlar.map((r) => (
          <Link
            key={r.branchId}
            href={`/prognoz/${productId}?branchId=${r.branchId}`}
            scroll={false}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-sm transition",
              r.branchId === tanlangan.branchId
                ? "border-primary bg-primary/10 font-medium"
                : "border-border hover:bg-muted"
            )}
          >
            {r.branch}
            <span className="ml-2 tabular-nums text-xs text-muted-foreground">{son(r.p50)}</span>
          </Link>
        ))}
      </div>

      <SeriyaKorinish qator={tanlangan} run={run} />
    </>
  );
}

async function SeriyaKorinish({ qator, run }: { qator: PrognozQator; run: Awaited<ReturnType<typeof oxirgiRun>> }) {
  if (!run) return null;
  const [tarix, baholar] = await Promise.all([
    seriyaTarixi(qator.productId, qator.branchId),
    bahoTarixi(qator.productId, qator.branchId),
  ]);
  const meta = SINF_META[qator.sinf] ?? SINF_META.KAM;
  // Haftalik grafik FAQAT talab har hafta bo'lgan sinflarda ma'noli. Siyrak sinfda
  // haftalarning ko'pi nol — grafik "sotuv tushdi" degan yolg'on taassurot beradi.
  const grafikMano = qator.sinf === "SMOOTH" || qator.sinf === "ERRATIC";

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Prognoz (${run.horizon} hafta jami)`}
          value={son(qator.p50)}
          icon={TrendingUp}
          hint={`${formatDateUZ(run.targetFrom)} — ${formatDateUZ(run.targetTo)}`}
        />
        <StatCard
          label="Zaxira tavsiyasi"
          value={son(qator.q90)}
          icon={ShieldCheck}
          hint={`${Math.round(run.servis * 100)}% servis darajasi uchun`}
        />
        <StatCard
          label="Nol ehtimoli"
          value={qator.zeroProb == null ? "—" : pc(qator.zeroProb)}
          icon={CircleSlash}
          hint="Tarixda sotuvsiz haftalar ulushi"
        />
        <StatCard
          label="Ishonch"
          value={
            qator.ishonch === "ISHONCHLI"
              ? "Ishonchli"
              : qator.ishonch === "TAXMINIY"
                ? "Taxminiy"
                : qator.ishonch === "ISHONCHSIZ"
                  ? "Ishonchsiz"
                  : "Baholanmagan"
          }
          icon={History}
          hint={qator.wape == null ? "hali fakt bilan solishtirilmagan" : `oxirgi oynalar WAPE ${pc(qator.wape)}`}
        />
      </div>

      <Card>
        <CardContent className="space-y-1 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Talab sinfi: {meta.nom}</span>
            <span className="text-muted-foreground">· model: {qator.modelKey}</span>
          </div>
          <p className="text-muted-foreground">{meta.izoh}</p>
          <p className="text-xs text-muted-foreground">
            O'tgan hafta fakti {son(qator.lastQty)} · naive baholash (o'tgan hafta × {run.horizon}){" "}
            {son(qator.baseline)} · model {son(qator.p50)}
          </p>
        </CardContent>
      </Card>

      {grafikMano ? (
        <Card>
          <CardContent className="p-4">
            <TarixChart
              tarix={tarix}
              p50={qator.p50}
              q90={qator.q90}
              horizon={run.horizon}
              targetFrom={run.targetFrom}
              targetTo={run.targetTo}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Soyalangan oyna — prognoz davri. Prognoz 4 haftaning JAMISI uchun berilgan, shuning uchun kelajakka
              haftalik chiziq emas, o'rtacha daraja ko'rsatilgan: haftalik aniqlik o'lchanmagan.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="space-y-1">
              <p className="font-medium">Haftalik grafik bu sinfda ko'rsatilmaydi</p>
              <p className="text-muted-foreground">
                Tarixdagi {tarix.length} haftadan {tarix.filter((t) => t.qty <= 0).length} tasida sotuv yo'q. Bunday
                seriyada haftalik chiziq nol bilan cho'qqilar orasida sakraydi va “sotuv tushdi” degan yolg'on
                taassurot beradi. Qaror uchun yuqoridagi 4 haftalik jami va zaxira tavsiyasi ishlatiladi.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">O'tgan prognozlar va fakt</h3>
            <p className="text-xs text-muted-foreground">
              Har qator — yopilgan 4 haftalik oyna. Qoldiq tugagan oynalar metrikadan chiqariladi (sotuv 0 bo'lgani
              talab yo'qligini bildirmaydi).
            </p>
          </div>
          {baholar.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Hali baholangan oyna yo'q — 4 haftalik prognozning fakti 4 haftadan keyin bilinadi.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-medium">Oyna oxiri</th>
                    <th className="px-3 py-2 text-right font-medium">Fakt</th>
                    <th className="px-3 py-2 text-right font-medium">Prognoz</th>
                    <th className="px-3 py-2 text-right font-medium">naive</th>
                    <th className="px-3 py-2 text-right font-medium">Zaxira (q90)</th>
                    <th className="px-3 py-2 text-right font-medium">Xato</th>
                  </tr>
                </thead>
                <tbody>
                  {baholar.map((b) => {
                    const xato = b.actual > 0 ? Math.abs(b.actual - b.forecast) / b.actual : null;
                    return (
                      <tr key={b.targetTo} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2">
                          {formatDateUZ(b.targetTo)}
                          {b.stockout && (
                            <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                              qoldiq tugagan
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{son(b.actual)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{son(b.forecast)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{son(b.baseline)}</td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            b.actual > b.q90 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                          )}
                        >
                          {son(b.q90)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{pc(xato)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
