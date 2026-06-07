"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { addAliasAction, deleteAliasAction } from "./actions";
import type { AliasSource } from "@/generated/prisma/enums";

export function AliasAddForm({ branchId }: { branchId: number }) {
  const [alias, setAlias] = useState("");
  const [source, setSource] = useState<string>("SALES");
  const [isPending, start] = useTransition();

  const onAdd = () => {
    if (!alias.trim()) {
      toast.error("Alias kiriting.");
      return;
    }
    start(async () => {
      const res = await addAliasAction({
        branchId,
        alias: alias.trim(),
        source: source as AliasSource,
      });
      if (res.ok) {
        toast.success("Alias qo'shildi.");
        setAlias("");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="text-sm font-medium">Yangi alias qo'shish</div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input
          placeholder="Excel ichidagi nom"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          disabled={isPending}
        />
        <Select value={source} onValueChange={(v) => setSource(v ?? "SALES")} disabled={isPending}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SALES">Sotuv</SelectItem>
            <SelectItem value="VISITS">Tashriflar</SelectItem>
            <SelectItem value="SR">Cheklar</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" onClick={onAdd} disabled={isPending}>
        <Plus className="h-4 w-4 mr-1" /> Qo'shish
      </Button>
    </div>
  );
}

export function AliasDeleteButton({ id, alias }: { id: number; alias: string }) {
  const [isPending, start] = useTransition();
  const onDelete = () => {
    if (!confirm(`"${alias}" aliasini o'chirasizmi?`)) return;
    start(async () => {
      const res = await deleteAliasAction(id);
      if (res.ok) toast.success("O'chirildi.");
      else toast.error(res.error);
    });
  };
  return (
    <Button variant="ghost" size="icon" onClick={onDelete} disabled={isPending}>
      <Trash2 className="h-3 w-3 text-destructive" />
    </Button>
  );
}

