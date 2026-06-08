import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminTier, isSystemAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { kategoriyalarSoni, botConfigured } from "@/lib/spisaniya/db";
import { Link2, ListChecks } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AutoMapButton, LinkSelect, type SubcatOpt } from "./client";

export default async function ChiqimKategoriyaPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (!isAdminTier(role)) redirect("/dashboard-v2");
  const canEdit = isSystemAdmin(role);

  if (!botConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader icon={Link2} title="Chiqim kategoriya bog'lash" description="bizbop kategoriyalari → Iyerarxiya subkategoriya" />
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          Spisaniya bazasi (bizbop) ulanmagan — <code>BOT_DATABASE_URL</code> sozlanmagan.
        </CardContent></Card>
      </div>
    );
  }

  const [bizbop, links, groups] = await Promise.all([
    kategoriyalarSoni(),
    prisma.spisaniyaCategoryLink.findMany({ select: { botName: true, categoryId: true } }),
    prisma.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        name: true,
        categories: {
          where: { parentId: null },
          orderBy: { sortOrder: "asc" },
          select: {
            name: true,
            children: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  // Subkat ro'yxati (bo'lim · kategoriya yorlig'i bilan)
  const subcats: SubcatOpt[] = groups.flatMap((g) =>
    g.categories.flatMap((c) =>
      c.children.map((s) => ({ id: s.id, name: s.name, catName: c.name, groupName: g.name }))
    )
  );
  const linkMap = new Map(links.map((l) => [l.botName, l.categoryId]));
  const validIds = new Set(subcats.map((s) => s.id));

  const total = bizbop.length;
  const mapped = bizbop.filter((b) => linkMap.has(b.nomi) && validIds.has(linkMap.get(b.nomi)!)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Link2}
        title="Chiqim kategoriya bog'lash"
        description="bizbop chiqim kategoriyalarini Iyerarxiya subkategoriyaga bog'lang"
      >
        {canEdit && <AutoMapButton />}
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Bog'langan" value={`${mapped} / ${total}`} icon={ListChecks} tone={mapped === total ? "green" : "orange"} />
        <StatCard label="Bog'lanmagan" value={String(total - mapped)} icon={Link2} tone="blue" hint="Bog'lanmagan chiqimlar sof foydaga kirmaydi" />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {total === 0 ? (
            <EmptyState icon={Link2} title="bizbop kategoriyalari yo'q" description="Spisaniya bazasida hali kategoriya yo'q." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Chiqim kategoriyasi (bizbop)</TableHead>
                    <TableHead className="text-right w-[90px]">Yozuv</TableHead>
                    <TableHead className="w-[300px]">Iyerarxiya subkategoriya</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bizbop.map((b) => {
                    const cur = linkMap.get(b.nomi) ?? null;
                    const valid = cur != null && validIds.has(cur) ? cur : null;
                    return (
                      <TableRow key={b.id} className="text-sm">
                        <TableCell className="font-medium">{b.nomi}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{b.soni}</TableCell>
                        <TableCell>
                          <LinkSelect botName={b.nomi} current={valid} subcats={subcats} canEdit={canEdit} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
