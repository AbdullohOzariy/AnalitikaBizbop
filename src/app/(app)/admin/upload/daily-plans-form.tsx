"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { uploadDailyPlansAction } from "./actions";

export function DailyPlansUploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await uploadDailyPlansAction(fd);
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
        <CardTitle>Kunlik reja</CardTitle>
        <CardDescription>
          Filial × kun × kategoriya bo'yicha &quot;Normal&quot; (reja) qiymatlari. Har sheet
          bitta filial. Faqat &quot;Normal&quot; ustuni o'qiladi. Mavjud davr uchun reja allaqachon
          yuklangan bo'lsa — fayl qabul qilinmaydi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plans-label">Fayl uchun nom</Label>
            <Input
              id="plans-label"
              name="label"
              placeholder="Masalan: Aprel 2026 — kunlik rejalar"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plans-file">Excel fayl (.xlsx)</Label>
            <Input
              id="plans-file"
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
