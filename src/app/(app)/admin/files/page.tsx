import { redirect } from "next/navigation";

export default function FilesPage() {
  redirect("/admin/upload?tab=files");
}
