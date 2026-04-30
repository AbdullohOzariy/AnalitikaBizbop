import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { sales: true, plans: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kategoriyalar</h1>
        <p className="text-sm text-muted-foreground">
          Sotuv tahlili uchun ishlatiladigan bo'limlar ro'yxati. Excel fayllarda bu nomlar bilan
          mos keladigan qatorlar olinadi.
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
                <TableHead className="text-right">Sotuv yozuvlari</TableHead>
                <TableHead className="text-right">Reja yozuvlari</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c._count.sales}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c._count.plans}
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
