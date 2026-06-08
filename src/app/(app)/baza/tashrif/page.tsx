import { redirect } from "next/navigation";

export default async function BazaTashrifRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "tashrif" });
  if (sp.start) params.set("start", sp.start);
  if (sp.end) params.set("end", sp.end);
  if (sp.branchId) params.set("branchId", sp.branchId);
  redirect(`/baza/metrika?${params.toString()}`);
}
