"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { warmAnalyticsCaches } from "@/lib/warm";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { actionError } from "@/lib/action-error";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";

export async function deleteFileAction(
  id: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin();
    await prisma.uploadedFile.delete({ where: { id } });
    revalidatePath("/admin/files");
    revalidatePath("/dashboard");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    after(() => warmAnalyticsCaches("file-delete"));
    return { ok: true };
  } catch (err) {
    return actionError(err, "files");
  }
}
