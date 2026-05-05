import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SalesUploadForm } from "./sales-form";
import { MetricsUploadForm } from "./metrics-form";
import { VisitsUploadForm } from "./visits-form";
import { DailyPlansUploadForm } from "./daily-plans-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function UploadPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/dashboard");

  const branches = await prisma.branch.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fayl yuklash</h1>
        <p className="text-sm text-muted-foreground">
          Excel fayllarni yuklash. Har bir fayl uchun alohida nom qo'ying.
        </p>
      </div>

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
    </div>
  );
}
