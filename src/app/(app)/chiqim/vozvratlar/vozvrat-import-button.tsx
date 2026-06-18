"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { importVozvratlarAction } from "./actions";

export function VozvratImportButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await importVozvratlarAction(fd);
      if (res.ok) {
        toast.success(
          `${res.created.toLocaleString("uz-UZ")} ta vozvrat qo'shildi` +
            (res.unmatched ? `, ${res.unmatched} ta filial mos kelmadi (${res.unmatchedSample.join(", ")})` : "")
        );
        router.refresh();
      } else toast.error(res.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
        title="Excel/CSV: Tovar, Miqdor, Summa, Filial (+ Birlik, Sabab, Yo'nalish, Ta'minotchi)"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Excel yuklash
      </Button>
    </>
  );
}
