"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Pencil } from "lucide-react";

export function EditModeToggle({
  readOnly,
  editor,
}: {
  readOnly: React.ReactNode;
  editor: React.ReactNode;
}) {
  const [edit, setEdit] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border p-0.5">
          <Button
            size="sm"
            variant={edit ? "ghost" : "secondary"}
            className="h-7"
            onClick={() => setEdit(false)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" /> {"Ko'rish"}
          </Button>
          <Button
            size="sm"
            variant={edit ? "secondary" : "ghost"}
            className="h-7"
            onClick={() => setEdit(true)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1" /> Tahrirlash
          </Button>
        </div>
      </div>
      {edit ? editor : readOnly}
    </div>
  );
}
