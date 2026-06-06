import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { ShoppingBag, Receipt, Users, Target, ChevronRight, Building2, Tag } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { AliasAddForm, AliasDeleteButton } from "./alias-manager";

const SOURCE_LABEL: Record<string, string> = {
  SALES: "Sotuv",
  VISITS: "Tashriflar",
  SR: "Cheklar",
  PLANS: "Reja",
};

const PALETTE = [
  { bg: "bg-emerald-500", soft: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  { bg: "bg-blue-500", soft: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  { bg: "bg-amber-500", soft: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  { bg: "bg-violet-500", soft: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20" },
  { bg: "bg-rose-500", soft: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20" },
];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const getBranches = unstable_cache(
  () =>
    prisma.branch.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        aliases: { orderBy: [{ source: "asc" }, { alias: "asc" }] },
        _count: { select: { sales: true, metrics: true, visits: true, plans: true, dailyPlans: true } },
      },
    }),
  ["branches-list"],
  { tags: ["branches"], revalidate: 300 }
);

export default async function BranchesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard-v2");
  // Bu sahifa faqat ADMIN uchun (yuqorida redirect) — barcha tahrir amallari ochiq.
  const branches = await getBranches();
  const totalAliases = branches.reduce((s, b) => s + b.aliases.length, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Building2}
        title="Filiallar"
        description="Har filial Excel fayllarda turli nomda (alias) uchraydi — bu yerda ularni xaritalashtiring."
      >
        <div className="flex gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <b className="text-sm">{branches.length}</b> filial
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <b className="text-sm">{totalAliases}</b> alias
          </span>
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {branches.map((b, i) => {
          const c = PALETTE[i % PALETTE.length];
          const stats = [
            { icon: ShoppingBag, label: "Sotuv", value: b._count.sales },
            { icon: Receipt, label: "Metrika (kun)", value: b._count.metrics },
            { icon: Users, label: "Tashrif (kun)", value: b._count.visits },
            { icon: Target, label: "Reja", value: b._count.plans + b._count.dailyPlans },
          ];
          const bySource = b.aliases.reduce<Record<string, typeof b.aliases>>((acc, a) => {
            (acc[a.source] ??= []).push(a);
            return acc;
          }, {});

          return (
            <div key={b.id} className="flex flex-col rounded-2xl border border-border bg-card shadow-sm">
              {/* sarlavha */}
              <div className="flex items-center gap-3 p-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${c.bg} text-sm font-bold text-white`}>
                  {initials(b.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">{b.name}</div>
                  <div className="text-xs text-muted-foreground">ID: {b.id} · {b.aliases.length} alias</div>
                </div>
                <Link
                  href={`/branches/${b.id}`}
                  className="inline-flex items-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Batafsil <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* statistika */}
              <div className="grid grid-cols-4 gap-px overflow-hidden border-y border-border/60 bg-border/60">
                {stats.map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-0.5 bg-card px-2 py-2.5 text-center">
                    <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="text-sm font-semibold tabular-nums">{s.value}</div>
                    <div className="text-[10px] leading-tight text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* aliaslar */}
              <div className="flex-1 space-y-3 p-4">
                {b.aliases.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Alias yo&apos;q.</p>
                ) : (
                  <div className="space-y-2.5">
                    {Object.entries(bySource).map(([source, items]) => (
                      <div key={source} className="space-y-1.5">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.soft}`}>
                          {SOURCE_LABEL[source] ?? source}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((a) => (
                            <span key={a.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-mono">
                              {a.alias}
                              <AliasDeleteButton id={a.id} alias={a.alias} />
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <AliasAddForm branchId={b.id} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
