"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { addCategoryAliasAction, deleteCategoryAliasAction } from "./actions";

export function CategoryAliasAddForm({ categoryId }: { categoryId: number }) {
  const [alias, setAlias] = useState("");
  const [isPending, start] = useTransition();

  const onAdd = () => {
    if (!alias.trim()) {
      toast.error("Alias kiriting.");
      return;
    }
    start(async () => {
      const res = await addCategoryAliasAction({ categoryId, alias: alias.trim() });
      if (res.ok) {
        toast.success("Alias qo'shildi.");
        setAlias("");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Excel ichidagi nom (masalan: CHISTYASHIYE SREDSTVI)"
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAdd()}
        disabled={isPending}
        className="h-8 text-xs font-mono"
      />
      <Button size="sm" onClick={onAdd} disabled={isPending} className="h-8">
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function CategoryAliasDeleteButton({ id, alias }: { id: number; alias: string }) {
  const [isPending, start] = useTransition();
  const onDelete = () => {
    if (!confirm(`"${alias}" aliasini o'chirasizmi?`)) return;
    start(async () => {
      const res = await deleteCategoryAliasAction(id);
      if (res.ok) toast.success("O'chirildi.");
      else toast.error(res.error);
    });
  };
  return (
    <Button variant="ghost" size="icon" onClick={onDelete} disabled={isPending} className="h-6 w-6">
      <Trash2 className="h-3 w-3 text-destructive" />
    </Button>
  );
}
