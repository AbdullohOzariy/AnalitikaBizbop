"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { uploadMetricsAction } from "./actions";

type Branch = { id: number; name: string };

export function MetricsUploadForm({ branches }: { branches: Branch[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [branchId, setBranchId] = useState<string>("");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!branchId) {
      toast.error("Filialni tanlang.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("branchId", branchId);
    start(async () => {
      const res = await uploadMetricsAction(fd);
      if (res.ok) {
        toast.success(res.summary);
        formRef.current?.reset();
        setFile(null);
        setBranchId("");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cheklar metrikasi — sr.xlsx</CardTitle>
        <CardDescription>
          "Средний чек за период ..." formati. Filial fayl ichida ko'rsatilmaganligi sababli, qaysi
          filial uchun ekanini majburiy tanlang.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="metrics-label">Fayl uchun nom</Label>
            <Input
              id="metrics-label"
              name="label"
              placeholder="Masalan: Aprel — Mega chek"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label>Filial *</Label>
            <Select value={branchId} onValueChange={(v) => setBranchId(v ?? "")} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Filialni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="metrics-file">Excel fayl (.xlsx)</Label>
            <Input
              id="metrics-file"
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
          <Button type="submit" disabled={isPending || !file || !branchId}>
            {isPending ? "Yuklanmoqda..." : "Yuklash"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
