/**
 * Inventarizatsiya hisoboti — kiritilgan sanashlar (SKU × filial × kun) va FARQ
 * (sanalgan − tizim; manfiy = kamomad, musbat = ortiqcha). Kun + filial bo'yicha
 * guruhlangan; sana oralig'i va filial bo'yicha filtrlanadi.
 */
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { BarChart2, CalendarDays, Building2 } from "lucide-react";
import { auth } from "@/auth";
import { canSeeInventory } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { parseDateParam, todayTashkentISO, isoDay } from "@/lib/date";
import { formatDateUZ, formatDateTimeUZ, decimalToNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inventarizatsiya hisoboti" };
export const dynamic = "force-dynamic";

const fmtQty = (n: number) => n.toLocaleString("uz-UZ", { maximumFractionDigits: 3 });
const fmtDiff = (n: number) => (n > 0 ? "+" : "") + fmtQty(n);
const diffClass = (n: number) =>
  n < 0 ? "text-destructive" : n > 0 ? "text-primary" : "text-muted-foreground";

type GroupRow = {
  id: number;
  code: number;
  name: string;
  systemQty: number;
  countedQty: number;
  diff: number;
  note: string | null;
  countedByName: string;
  updatedAtText: string;
};
type Group = { key: string; dayText: string; branchName: string; totalDiff: number; rows: GroupRow[] };

export default async function InventarHisobotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user || !canSeeInventory(session.user.roles)) redirect("/dashboard");
  const sp = await searchParams;

  // Default oraliq: oxirgi 7 kun (Toshkent bo'yicha bugun bilan tugaydi)
  const defEnd = new Date(todayTashkentISO() + "T00:00:00.000Z");
  const defStart = new Date(defEnd.getTime() - 6 * 86_400_000);
  const start = parseDateParam(sp.start, defStart) ?? defStart;
  const end = parseDateParam(sp.end, defEnd) ?? defEnd;
  const branchId =
    sp.branchId && /^\d+$/.test(sp.branchId) ? Number(sp.branchId) : undefined;

  const [branches, counts] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.inventoryCount.findMany({
      where: {
        sanaKuni: { gte: start, lte: end },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        product: { select: { code: true, name: true } },
        countedBy: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: [
        { sanaKuni: "desc" },
        { branch: { name: "asc" } },
        { product: { name: "asc" } },
      ],
    }),
  ]);

  // Kun + filial bo'yicha guruhlash (so'rov tartibi bo'yicha ketma-ket)
  const groups: Group[] = [];
  for (const c of counts) {
    const key = `${isoDay(c.sanaKuni)}|${c.branchId}`;
    const systemQty = decimalToNumber(c.systemQty);
    const countedQty = decimalToNumber(c.countedQty);
    const row: GroupRow = {
      id: c.id,
      code: c.product.code,
      name: c.product.name,
      systemQty,
      countedQty,
      diff: countedQty - systemQty,
      note: c.note,
      countedByName: c.countedBy.name,
      updatedAtText: formatDateTimeUZ(c.updatedAt),
    };
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
      last.totalDiff += row.diff;
    } else {
      groups.push({
        key,
        dayText: formatDateUZ(c.sanaKuni),
        branchName: c.branch.name,
        totalDiff: row.diff,
        rows: [row],
      });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={BarChart2}
        title="Inventarizatsiya hisoboti"
        description="Sanash natijalari — tizim qoldig'i va sanalgan miqdor farqi (kun × filial kesimida)"
      />

      {/* Filtr — oddiy GET forma */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
      >
        <div className="space-y-1.5">
          <label htmlFor="f-start" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Boshlanish
          </label>
          <input
            id="f-start"
            type="date"
            name="start"
            defaultValue={isoDay(start)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm shadow-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="f-end" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" /> Tugash
          </label>
          <input
            id="f-end"
            type="date"
            name="end"
            defaultValue={isoDay(end)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm shadow-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="f-branch" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> Filial
          </label>
          <select
            id="f-branch"
            name="branchId"
            defaultValue={branchId ? String(branchId) : ""}
            className="h-10 min-w-44 rounded-xl border border-border bg-background px-3 text-sm shadow-sm"
          >
            <option value="">Barcha filiallar</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" className="h-10 rounded-xl">Ko&apos;rsatish</Button>
      </form>

      {/* Natijalar — kun × filial guruhlangan jadval */}
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-border/60 bg-card py-10 text-center text-sm text-muted-foreground shadow-sm">
          Tanlangan davrda sanash kiritilmagan.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Kod</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Tizim qoldig&apos;i</TableHead>
                  <TableHead className="text-right">Sanalgan</TableHead>
                  <TableHead className="text-right">Farq</TableHead>
                  <TableHead>Izoh</TableHead>
                  <TableHead>Kiritgan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={7} className="py-2 text-[13px] font-semibold">
                        {g.dayText} — {g.branchName}
                        <span className={cn("ml-3 tabular-nums", diffClass(g.totalDiff))}>
                          jami farq: {fmtDiff(g.totalDiff)}
                        </span>
                        <span className="ml-3 font-normal text-muted-foreground">
                          {g.rows.length} ta SKU
                        </span>
                      </TableCell>
                    </TableRow>
                    {g.rows.map((r) => (
                      <TableRow key={`${g.key}-${r.id}`}>
                        <TableCell className="tabular-nums text-muted-foreground">{r.code}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtQty(r.systemQty)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtQty(r.countedQty)}</TableCell>
                        <TableCell className={cn("text-right font-semibold tabular-nums", diffClass(r.diff))}>
                          {fmtDiff(r.diff)}
                        </TableCell>
                        <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={r.note ?? undefined}>
                          {r.note ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.countedByName} · {r.updatedAtText}
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
