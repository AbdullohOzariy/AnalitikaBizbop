import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminTier, hasRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatUZS } from "@/lib/format";
import { Wallet, Layers, TrendingDown } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExpenseForm, ExpenseFilter, DeleteExpenseButton } from "./finans-client";

function fmtNum(n: unknown, decimals = 0): string {
  const num = typeof n === "object" && n !== null && "toNumber" in n
    ? (n as { toNumber(): number }).toNumber()
    : Number(n);
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: decimals }).format(num);
}
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function parseDate(s: string | undefined): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? undefined : d;
}

export default async function FinansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const roles = session.user.roles;
  if (!isAdminTier(roles) && !hasRole(roles, "CEO")) redirect("/dashboard-v2");
  const canEdit = isAdminTier(roles);

  const sp = await searchParams;
  const now = new Date();
  const defStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const start = parseDate(sp.start) ?? defStart;
  const end = parseDate(sp.end) ?? defEnd;

  const [rows, agg] = await Promise.all([
    prisma.expense.findMany({
      where: { spentAt: { gte: start, lte: end }, deletedAt: null },
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.expense.aggregate({
      where: { spentAt: { gte: start, lte: end }, deletedAt: null },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const total = agg._sum.amount ? Number(agg._sum.amount) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Wallet}
        title="Finans — Harajatlar"
        description="Sotuv bo'limi harajatlari ro'yxati"
      >
        <ExpenseFilter start={ymd(start)} end={ymd(end)} />
      </PageHeader>

      {/* Statistika */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Jami harajat" value={`${formatUZS(total, { compact: true })}`} icon={TrendingDown} tone="red" hint={`${formatUZS(total)} so'm`} />
        <StatCard label="Yozuvlar" value={agg._count.toLocaleString("uz-UZ")} icon={Layers} tone="blue" />
      </div>

      {/* Qo'shish formasi */}
      {canEdit && <ExpenseForm />}

      {/* Jadval */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Bu davrda harajat yo'q"
              description={canEdit ? "Yuqoridagi formadan harajat qo'shing." : "Boshqa davr tanlang."}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Nomi</TableHead>
                    <TableHead className="text-right w-[110px]">Miqdori</TableHead>
                    <TableHead className="text-right w-[140px]">Narxi</TableHead>
                    <TableHead className="text-right w-[150px]">Summasi</TableHead>
                    <TableHead className="w-[110px]">Sana</TableHead>
                    <TableHead className="w-[140px]">Kim kiritdi</TableHead>
                    {canEdit && <TableHead className="w-[50px]" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="text-sm">
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.quantity, 3)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{fmtNum(r.unitPrice)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmtNum(r.amount)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{ymd(r.spentAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate">{r.createdBy.name}</TableCell>
                      {canEdit && (
                        <TableCell className="pr-3 text-right"><DeleteExpenseButton id={r.id} /></TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
