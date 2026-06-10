import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminTier, isSystemAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { botConfigured, chiqimKatsiz } from "@/lib/spisaniya/db";
import { Tags, ListChecks } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MoslashSelect, type SubOpt } from "./client";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 200;

function fmtNum(n: number) {
  return new Intl.NumberFormat("uz-UZ").format(Math.round(n));
}

export default async function ChiqimMoslashPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (!isAdminTier(role)) redirect("/dashboard-v2");
  const canEdit = isSystemAdmin(role);

  if (!botConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader icon={Tags} title="Kategoriya moslash" description="Kategoriyasiz chiqimlarni subkategoriyaga moslash" />
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          Spisaniya bazasi (bizbop) ulanmagan — <code>BOT_DATABASE_URL</code> sozlanmagan.
        </CardContent></Card>
      </div>
    );
  }

  const [katsiz, subRows] = await Promise.all([
    chiqimKatsiz(PAGE_SIZE),
    prisma.category.findMany({
      where: { parentId: { not: null } },
      select: { id: true, name: true, parent: { select: { name: true } }, group: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  // Dublikat subkat nomi → ota-kategoriya bilan farqlanadi (backfill bilan bir xil label)
  const cnt = new Map<string, number>();
  for (const s of subRows) cnt.set(s.name, (cnt.get(s.name) ?? 0) + 1);
  const subs: SubOpt[] = subRows.map((s) => {
    const cat = s.parent?.name ?? "-";
    const dup = (cnt.get(s.name) ?? 0) > 1;
    return {
      id: s.id,
      name: s.name,
      cat,
      group: s.group?.name ?? "-",
      label: (dup ? `${s.name} (${cat})` : s.name).slice(0, 100),
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Tags}
        title="Kategoriya moslash"
        description="AI biriktira olmagan chiqimlarni qo'lda subkategoriyaga moslang"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Kategoriyasiz chiqim" value={fmtNum(katsiz.total)} icon={ListChecks} tone={katsiz.total === 0 ? "green" : "orange"} hint="Foydaga kirmaydi" />
        <StatCard label="Mavjud subkategoriya" value={String(subs.length)} icon={Tags} tone="blue" />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {katsiz.rows.length === 0 ? (
            <EmptyState icon={Tags} title="Hammasi biriktirilgan 🎉" description="Kategoriyasiz chiqim qolmadi." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Mahsulot</TableHead>
                    <TableHead className="w-[120px]">Filial</TableHead>
                    <TableHead className="text-right w-[120px]">Summa</TableHead>
                    <TableHead className="w-[110px]">Sana</TableHead>
                    <TableHead className="w-[290px]">Subkategoriya</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {katsiz.rows.map((r) => (
                    <TableRow key={r.id} className="text-sm">
                      <TableCell className="font-medium">{r.tovar}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.filial}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.summa)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.vaqt?.slice(0, 10)}</TableCell>
                      <TableCell><MoslashSelect yozuvId={r.id} subs={subs} canEdit={canEdit} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {katsiz.total > katsiz.rows.length && (
                <div className="border-t border-border/60 px-4 py-3 text-center text-xs text-muted-foreground">
                  {katsiz.rows.length} / {fmtNum(katsiz.total)} ko'rsatildi — moslagan sari kamayadi.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
