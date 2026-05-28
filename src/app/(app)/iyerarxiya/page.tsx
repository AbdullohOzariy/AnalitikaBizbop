import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryAliasAddForm, CategoryAliasDeleteButton } from "./alias-manager";

const getHierarchy = unstable_cache(
  () =>
    prisma.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { parentId: null },
          orderBy: { sortOrder: "asc" },
          include: {
            aliases: { orderBy: { alias: "asc" } },
            children: { orderBy: { sortOrder: "asc" } },
            _count: { select: { sales: true, plans: true, dailyPlans: true } },
          },
        },
      },
    }),
  ["iyerarxiya-list"],
  { tags: ["iyerarxiya"], revalidate: 300 }
);

const getUngrouped = unstable_cache(
  () =>
    prisma.category.findMany({
      where: { groupId: null, parentId: null },
      orderBy: { name: "asc" },
      include: {
        aliases: { orderBy: { alias: "asc" } },
        _count: { select: { sales: true, plans: true, dailyPlans: true } },
      },
    }),
  ["iyerarxiya-ungrouped"],
  { tags: ["iyerarxiya"], revalidate: 300 }
);

const GROUP_COLORS: Record<string, string> = {
  "FRESH":    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  "FOOD":     "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  "NON-FOOD": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
};

export default async function IyerarxiyaPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const [groups, ungrouped] = await Promise.all([getHierarchy(), getUngrouped()]);

  const totalCategories = groups.reduce((s, g) => s + g.categories.length, 0) + ungrouped.length;
  const totalSubcategories = groups.reduce(
    (s, g) => s + g.categories.reduce((cs, c) => cs + c.children.length, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Iyerarxiya</h1>
        <p className="text-sm text-muted-foreground">
          Tovarlar iyerarxiyasi: Guruh → Kategoriya → Subkategoriya.{" "}
          {groups.length} ta guruh, {totalCategories} ta kategoriya, {totalSubcategories} ta subkategoriya.
        </p>
      </div>

      {groups.map((group) => (
        <Card key={group.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span
                className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${
                  GROUP_COLORS[group.name] ?? "bg-muted text-muted-foreground border-border"
                }`}
              >
                {group.name}
              </span>
              <span className="text-muted-foreground font-normal text-sm">
                {group.categories.length} ta kategoriya
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Kategoriya</TableHead>
                  <TableHead>Subkategoriyalar</TableHead>
                  <TableHead>Aliaslar (Excel nomlar)</TableHead>
                  <TableHead className="text-right w-20">Sotuv</TableHead>
                  <TableHead className="text-right w-20">Reja</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.categories.map((c, i) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-muted-foreground align-top pt-3 text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium align-top pt-3 whitespace-nowrap">{c.name}</TableCell>
                    <TableCell className="align-top pt-2">
                      {c.children.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {c.children.map((sub) => (
                            <span
                              key={sub.id}
                              className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                            >
                              {sub.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-2 py-1">
                        {c.aliases.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Alias yo'q</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {c.aliases.map((a) => (
                              <span
                                key={a.id}
                                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono"
                              >
                                {a.alias}
                                {isAdmin && (
                                  <CategoryAliasDeleteButton id={a.id} alias={a.alias} />
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                        {isAdmin && <CategoryAliasAddForm categoryId={c.id} />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top pt-3 text-sm">
                      {c._count.sales}
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top pt-3 text-sm">
                      {c._count.plans + c._count.dailyPlans}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {ungrouped.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Guruhsiz</span>
              <span className="text-muted-foreground font-normal text-sm">
                {ungrouped.length} ta (analitikada ko'rinmaydi)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Kategoriya</TableHead>
                  <TableHead>Aliaslar</TableHead>
                  <TableHead className="text-right w-20">Sotuv</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ungrouped.map((c, i) => (
                  <TableRow key={c.id} className="opacity-60">
                    <TableCell className="text-muted-foreground align-top pt-3 text-xs">{i + 1}</TableCell>
                    <TableCell className="font-medium align-top pt-3">{c.name}</TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-2 py-1">
                        {c.aliases.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Alias yo'q</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {c.aliases.map((a) => (
                              <span
                                key={a.id}
                                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono"
                              >
                                {a.alias}
                                {isAdmin && (
                                  <CategoryAliasDeleteButton id={a.id} alias={a.alias} />
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                        {isAdmin && <CategoryAliasAddForm categoryId={c.id} />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top pt-3 text-sm">
                      {c._count.sales}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
