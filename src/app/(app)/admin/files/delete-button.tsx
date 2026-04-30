"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteFileAction } from "./actions";

export function DeleteFileButton({ id, label }: { id: number; label: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, start] = useTransition();

  const onConfirm = () => {
    start(async () => {
      const res = await deleteFileAction(id);
      if (res.ok) {
        toast.success(`"${label}" o'chirildi.`);
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <>
      <Button variant="ghost" size="icon" title="O'chirish" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
        <DialogHeader>
          <DialogTitle>O'chirishni tasdiqlang</DialogTitle>
          <DialogDescription>
            "{label}" faylni va undan olingan barcha ma'lumotlarni o'chirasiz. Bu amalni qaytarib
            bo'lmaydi.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Bekor qilish
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "O'chirilmoqda..." : "O'chirish"}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
