import { redirect } from "next/navigation";
import { FolderUp } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SalesUploadForm } from "./sales-form";
import { MetricsUploadForm } from "./metrics-form";
import { VisitsUploadForm } from "./visits-form";
import { DailyPlansUploadForm } from "./daily-plans-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { DeleteFileButton } from "../files/delete-button";

const TYPE_LABEL: Record<string, string> = {
  SALES: "Sotuv",
  METRICS: "Cheklar",
  VISITS: "Tashriflar",
  DAILY_PLANS: "Kunlik reja",
};

export default async function UploadPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const [branches, files] = await Promise.all([
    prisma.branch.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.uploadedFile.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        branch: { select: { name: true } },
        uploadedBy: { select: { name: true, email: true } },
        _count: {
          select: { sales: true, metrics: true, visits: true, dailyPlans: true },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FolderUp}
        title="Fayllar"
        description="Yangi Excel fayllarni yuklang yoki avval yuklanganlarni ko'ring/o'chiring."
      />

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList>
          <TabsTrigger value="upload">Yuklash</TabsTrigger>
          <TabsTrigger value="files">Yuklangan fayllar ({files.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Tabs defaultValue="sales" className="space-y-6">
            <TabsList>
              <TabsTrigger value="sales">Sotuv (kategoriyalar)</TabsTrigger>
              <TabsTrigger value="metrics">Cheklar (sr.xlsx)</TabsTrigger>
              <TabsTrigger value="visits">Tashriflar</TabsTrigger>
              <TabsTrigger value="plans">Kunlik reja</TabsTrigger>
            </TabsList>
            <TabsContent value="sales">
              <SalesUploadForm />
            </TabsContent>
            <TabsContent value="metrics">
              <MetricsUploadForm branches={branches} />
            </TabsContent>
            <TabsContent value="visits">
              <VisitsUploadForm />
            </TabsContent>
            <TabsContent value="plans">
              <DailyPlansUploadForm />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="files">
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
                        f._count.sales +
                        f._count.metrics +
                        f._count.visits +
                        f._count.dailyPlans;
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
                          <TableCell className="text-right tabular-nums">{rowCount}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium text-foreground">
                              {f.uploadedBy.name?.trim() || f.uploadedBy.email}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {f.uploadedBy.email}
                            </div>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
