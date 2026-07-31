import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingUp, Gauge, Boxes, PackageSearch, LineChart } from "lucide-react";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { oxirgiRun, prognozJami, prognozRoyxat, type PrognozFiltr } from "@/lib/prognoz/oqish";
import { formatDateUZ } from "@/lib/format";
import { PrognozFilter } from "./prognoz-filter";
import { PrognozJadval } from "./prognoz-client";

/** Ro'yxat KLIENT tomonda saralanadi/filtrlanadi — shuning uchun qator soni cheklanadi. */
const LIMIT = 300;

export default async function PrognozPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeAnalytics(session.user.roles)) redirect("/dashboard");

  const sp = await searchParams;
  const filtr: PrognozFiltr = {
    branchId: sp.branchId ? parseInt(sp.branchId) : undefined,
    katId: sp.categoryId ? parseInt(sp.categoryId) : undefined,
    abc: sp.abc || undefined,
    sinf: sp.sinf || undefined,
    q: sp.q?.trim() || undefined,
    limit: LIMIT,
  };

  const [branches, categories] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
      where: { products: { some: {} } },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={TrendingUp}
        title="Talab prognozi"
        description="SKU × filial bo'yicha keyingi 4 haftaning jami talabi va zaxira tavsiyasi"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/prognoz/sifat"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <Gauge className="h-4 w-4" />
            Prognoz sifati
          </Link>
          <PrognozFilter
            basePath="/prognoz"
            branches={branches}
            categories={categories}
            sp={{ branchId: sp.branchId, categoryId: sp.categoryId, abc: sp.abc, sinf: sp.sinf, q: sp.q }}
          />
        </div>
      </PageHeader>

      <Suspense
        key={[sp.branchId, sp.categoryId, sp.abc, sp.sinf, sp.q].join("|")}
        fallback={<PrognozSkeleton />}
      >
        <PrognozData filtr={filtr} />
      </Suspense>
    </div>
  );
}

function PrognozSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-96 w-full rounded-2xl" />
    </>
  );
}

async function PrognozData({ filtr }: { filtr: PrognozFiltr }) {
  const run = await oxirgiRun();
  if (!run) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Prognoz hali hisoblanmagan"
        description="Haftalik hisob seshanba kuni 05:00 da ishlaydi. Qo'lda ishga tushirish: scripts/prognoz-run.ts"
      />
    );
  }

  const [rows, jami] = await Promise.all([prognozRoyxat(run.id, filtr), prognozJami(run.id, filtr)]);
  const somJami = rows.reduce((s, r) => s + r.som, 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Prognoz oynasi"
          value={`${formatDateUZ(run.targetFrom)} — ${formatDateUZ(run.targetTo)}`}
          icon={LineChart}
          hint={`${run.horizon} hafta · origin ${formatDateUZ(run.weekStart)}`}
        />
        <StatCard
          label="Qamralgan SKU"
          value={jami.sku.toLocaleString("uz-UZ")}
          icon={PackageSearch}
          hint={`${jami.seriya.toLocaleString("uz-UZ")} SKU×filial seriyasi`}
        />
        <StatCard
          label="Prognoz qiymati"
          value={Math.round(jami.som).toLocaleString("uz-UZ")}
          icon={Boxes}
          hint="4 haftalik talab × dona narxi (so'm)"
        />
        <StatCard
          label="Servis darajasi"
          value={`${Math.round(run.servis * 100)}%`}
          icon={Gauge}
          hint="Zaxira tavsiyasi shu ehtimol bilan talabni qoplaydi"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={PackageSearch} title="Filtrga mos SKU topilmadi" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                So'mli hissasi bo'yicha eng katta{" "}
                <span className="font-medium text-foreground">{rows.length.toLocaleString("uz-UZ")}</span> seriya
                {jami.seriya > rows.length && (
                  <> ({jami.seriya.toLocaleString("uz-UZ")} tadan) — qolganini ko'rish uchun filtrni torroq qiling</>
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">
                ko'rsatilgan qiymat: {Math.round(somJami).toLocaleString("uz-UZ")} so'm
              </span>
            </div>
            <PrognozJadval rows={rows} horizon={run.horizon} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
