"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { uploadSalesAction } from "./actions";

export function SalesUploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await uploadSalesAction(fd);
      if (res.ok) {
        toast.success(res.summary);
        if (res.aiCorrections?.length) {
          toast.info(`AI tuzatishlar (${res.aiCorrections.length}):\n${res.aiCorrections.join("\n")}`, {
            duration: 8000,
          });
        }
        formRef.current?.reset();
        setFile(null);
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sotuv fayli — kategoriyalar bo'yicha</CardTitle>
        <CardDescription>
          1C dan eksport qilingan "Продажи товаров" formati. Bir kunlik (1 filial) yoki davriy
          (4 filial) bo'lishi mumkin — avtomatik aniqlanadi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sales-label">Fayl uchun nom</Label>
            <Input
              id="sales-label"
              name="label"
              placeholder="Masalan: 29.04 — kunlik"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sales-period">Sotuv sanasi (kunlik fayl uchun)</Label>
            <Input
              id="sales-period"
              name="period"
              type="date"
              disabled={isPending}
              className="w-44"
            />
            <p className="text-xs text-muted-foreground">
              Kunlik faylда sanani shu yerда kiriting — fayl shu kun ma&apos;lumoti deb saqlanadi.
              Faylда &quot;за период с … по …&quot; sarlavhasi bo&apos;lsa, bo&apos;sh qoldirsangiz ham bo&apos;ladi.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sales-file">Excel fayl (.xlsx)</Label>
            <Input
              id="sales-file"
              name="file"
              type="file"
              accept=".xlsx,.xls"
              required
              disabled={isPending}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
          <Button type="submit" disabled={isPending || !file}>
            {isPending ? "Yuklanmoqda..." : "Yuklash"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
