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

const getCategories = unstable_cache(
  () =>
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        aliases: { orderBy: { alias: "asc" } },
        _count: { select: { sales: true, plans: true, dailyPlans: true } },
      },
    }),
  ["categories-list"],
  { tags: ["categories"], revalidate: 300 }
);

export default async function CategoriesPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const categories = await getCategories();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kategoriyalar</h1>
        <p className="text-sm text-muted-foreground">
          Sotuv tahlili uchun ishlatiladigan bo'limlar. Excel fayllarda har xil yozilgan
          nomlar uchun alias qo'shing — keyingi yuklashlarda avtomatik tanidi.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hammasi: {categories.length}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Aliaslar (Excel ichidagi nomlar)</TableHead>
                <TableHead className="text-right w-28">Sotuv</TableHead>
                <TableHead className="text-right w-28">Reja</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground align-top pt-3">{i + 1}</TableCell>
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
                  <TableCell className="text-right tabular-nums align-top pt-3">
                    {c._count.sales}
                  </TableCell>
                  <TableCell className="text-right tabular-nums align-top pt-3">
                    {c._count.plans + c._count.dailyPlans}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
