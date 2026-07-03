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
import { uploadVisitsAction } from "./actions";
import { nowTashkent } from "@/lib/date";

// Toshkent (UTC+5) yili — getFullYear() lokal TZ'ga bog'liq: server (UTC) va brauzer
// yil chegarasida farq qilib hydration mismatch berishi mumkin edi.
const CURRENT_YEAR = nowTashkent().getUTCFullYear();
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];

export function VisitsUploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState<string>(String(CURRENT_YEAR));

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("year", year);
    start(async () => {
      const res = await uploadVisitsAction(fd);
      if (res.ok) {
        toast.success(res.summary);
        if (res.aiCorrections?.length) {
          toast.info(`AI tuzatishlar (${res.aiCorrections.length}):\n${res.aiCorrections.join("\n")}`, {
            duration: 8000,
          });
        }
        formRef.current?.reset();
        setFile(null);
        setYear(String(CURRENT_YEAR));
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tashriflar fayli</CardTitle>
        <CardDescription>
          Kunlik tashriflar (4 filial × kunlar). Fayl ichida yil ko'rsatilmaganligi uchun yilni
          alohida tanlang.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="visits-label">Fayl uchun nom</Label>
            <Input
              id="visits-label"
              name="label"
              placeholder="Masalan: Aprel — tashriflar"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label>Yil *</Label>
            <Select value={year} onValueChange={(v) => setYear(v ?? String(CURRENT_YEAR))} disabled={isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="visits-file">Excel fayl (.xlsx)</Label>
            <Input
              id="visits-file"
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
