import { redirect } from "next/navigation";
import { auth } from "@/auth";
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
import { formatDateUZ, formatDateRangeUZ } from "@/lib/format";
import { DeleteFileButton } from "./delete-button";

const TYPE_LABEL: Record<string, string> = {
  SALES: "Sotuv",
  METRICS: "Cheklar",
  VISITS: "Tashriflar",
};

export default async function FilesPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const files = await prisma.uploadedFile.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      branch: { select: { name: true } },
      uploadedBy: { select: { name: true } },
      _count: {
        select: { sales: true, metrics: true, visits: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Yuklangan fayllar</h1>
        <p className="text-sm text-muted-foreground">
          Faylni o'chirsangiz, undan kelgan barcha ma'lumotlar ham o'chiriladi.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hammasi: {files.length}</CardTitle>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hali fayl yuklanmagan.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Turi</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Qatorlar</TableHead>
                  <TableHead>Yuklagan</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => {
                  const rowCount =
                    f._count.sales + f._count.metrics + f._count.visits;
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        <div>{f.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.originalName}
                        </div>
                      </TableCell>
                      <TableCell>{TYPE_LABEL[f.fileType] ?? f.fileType}</TableCell>
                      <TableCell>{f.branch?.name ?? "—"}</TableCell>
                      <TableCell>
                        {f.periodStart && f.periodEnd
                          ? formatDateRangeUZ(f.periodStart, f.periodEnd)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {rowCount}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {f.uploadedBy.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateUZ(f.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DeleteFileButton id={f.id} label={f.label} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
