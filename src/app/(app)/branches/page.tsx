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
import { AliasAddForm, AliasDeleteButton } from "./alias-manager";

const SOURCE_LABEL: Record<string, string> = {
  SALES: "Sotuv (Склад)",
  VISITS: "Tashriflar (Filial)",
  SR: "Cheklar (sr)",
  PLANS: "Reja (sheet nomi)",
};

const getBranches = unstable_cache(
  () =>
    prisma.branch.findMany({
      orderBy: { sortOrder: "asc" },
      include: { aliases: { orderBy: [{ source: "asc" }, { alias: "asc" }] } },
    }),
  ["branches-list"],
  { tags: ["branches"], revalidate: 300 }
);

export default async function BranchesPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const branches = await getBranches();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Filiallar</h1>
        <p className="text-sm text-muted-foreground">
          Har filial bir nechta nomda Excel fayllarda uchrashi mumkin (alias). Yangi alias qo'shish
          orqali avval tanilmagan nomlarni xaritalashtiring.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {branches.map((b) => (
          <Card key={b.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{b.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  ID: {b.id}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Alias xaritasi</div>
                {b.aliases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Alias yo'q.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Manba</TableHead>
                        <TableHead>Alias (Excel ichidagi nom)</TableHead>
                        {isAdmin && <TableHead></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {b.aliases.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {SOURCE_LABEL[a.source] ?? a.source}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{a.alias}</TableCell>
                          {isAdmin && (
                            <TableCell className="w-10">
                              <AliasDeleteButton id={a.id} alias={a.alias} />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              {isAdmin && <AliasAddForm branchId={b.id} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
