import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { CategoryAliasAddForm, CategoryAliasDeleteButton } from "./alias-manager";

const getHierarchy = unstable_cache(
  () =>
    prisma.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { parentId: null },
          orderBy: { sortOrder: "asc" },
          include: {
            aliases: { orderBy: { alias: "asc" } },
            children: { orderBy: { sortOrder: "asc" } },
            _count: { select: { sales: true, plans: true, dailyPlans: true } },
          },
        },
      },
    }),
  ["iyerarxiya-list"],
  { tags: ["iyerarxiya"], revalidate: 300 }
);

const getUngrouped = unstable_cache(
  () =>
    prisma.category.findMany({
      where: { groupId: null, parentId: null },
      orderBy: { name: "asc" },
      include: {
        aliases: { orderBy: { alias: "asc" } },
        _count: { select: { sales: true, plans: true, dailyPlans: true } },
      },
    }),
  ["iyerarxiya-ungrouped"],
  { tags: ["iyerarxiya"], revalidate: 300 }
);

const GROUP_COLORS: Record<string, { dot: string; badge: string }> = {
  "FRESH":    { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "FOOD":     { dot: "bg-amber-500",   badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  "NON-FOOD": { dot: "bg-blue-500",    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
};

export default async function IyerarxiyaPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const [groups, ungrouped] = await Promise.all([getHierarchy(), getUngrouped()]);

  const totalCategories = groups.reduce((s, g) => s + g.categories.length, 0) + ungrouped.length;
  const totalSubcategories = groups.reduce(
    (s, g) => s + g.categories.reduce((cs, c) => cs + c.children.length, 0),
    0
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Iyerarxiya</h1>
        <p className="text-sm text-muted-foreground">
          {groups.length} ta guruh · {totalCategories} ta kategoriya · {totalSubcategories} ta subkategoriya
        </p>
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const colors = GROUP_COLORS[group.name] ?? {
            dot: "bg-muted-foreground",
            badge: "bg-muted text-muted-foreground border-border",
          };
          return (
            /* ── GURUH ── */
            <details key={group.id} open className="group/g rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-3 list-none">
                {/* chevron */}
                <svg
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/g:rotate-90"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold ${colors.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                  {group.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {group.categories.length} ta kategoriya
                </span>
              </summary>

              {/* kategoriyalar ro'yxati */}
              <div className="border-t border-border/60 divide-y divide-border/40">
                {group.categories.map((cat) => (
                  /* ── KATEGORIYA ── */
                  <details key={cat.id} className="group/c">
                    <summary className="flex cursor-pointer select-none items-start gap-3 px-4 py-2.5 list-none hover:bg-muted/40 transition-colors">
                      {/* indent line */}
                      <span className="mt-0.5 ml-6 shrink-0">
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-open/c:rotate-90"
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{cat.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {cat.children.length > 0 && `${cat.children.length} subkat`}
                          {cat._count.sales > 0 && ` · ${cat._count.sales} sotuv`}
                        </span>
                      </span>
                      {/* aliaslar yig'masi */}
                      {cat.aliases.length > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {cat.aliases.length} alias
                        </span>
                      )}
                    </summary>

                    {/* kategoriya ichidagi tafsilot */}
                    <div className="px-4 pb-3 pt-1 ml-14 space-y-3">

                      {/* subkategoriyalar */}
                      {cat.children.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                            Subkategoriyalar
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {cat.children.map((sub) => (
                              <span
                                key={sub.id}
                                className="inline-flex items-center gap-1 rounded-md bg-muted/60 border border-border/50 px-2 py-0.5 text-xs"
                              >
                                <span className="h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                                {sub.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* aliaslar */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                          Aliaslar (Excel nomlar)
                        </p>
                        <div className="space-y-1.5">
                          {cat.aliases.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">Alias yo'q</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {cat.aliases.map((a) => (
                                <span
                                  key={a.id}
                                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono"
                                >
                                  {a.alias}
                                  {isAdmin && <CategoryAliasDeleteButton id={a.id} alias={a.alias} />}
                                </span>
                              ))}
                            </div>
                          )}
                          {isAdmin && <CategoryAliasAddForm categoryId={cat.id} />}
                        </div>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          );
        })}

        {/* guruhsiz kategoriyalar */}
        {ungrouped.length > 0 && (
          <details className="group/g rounded-xl border border-border bg-card opacity-70">
            <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-3 list-none">
              <svg
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/g:rotate-90"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                Guruhsiz
              </span>
              <span className="text-xs text-muted-foreground">
                {ungrouped.length} ta · analitikada ko'rinmaydi
              </span>
            </summary>
            <div className="border-t border-border/60 divide-y divide-border/40">
              {ungrouped.map((cat) => (
                <details key={cat.id} className="group/c">
                  <summary className="flex cursor-pointer select-none items-start gap-3 px-4 py-2.5 list-none hover:bg-muted/40 transition-colors">
                    <span className="mt-0.5 ml-6 shrink-0">
                      <svg
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-open/c:rotate-90"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                    <span className="flex-1 font-medium text-sm">{cat.name}</span>
                    {cat._count.sales > 0 && (
                      <span className="text-xs text-muted-foreground">{cat._count.sales} sotuv</span>
                    )}
                  </summary>
                  <div className="px-4 pb-3 pt-1 ml-14">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                      Aliaslar
                    </p>
                    <div className="space-y-1.5">
                      {cat.aliases.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Alias yo'q</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {cat.aliases.map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono"
                            >
                              {a.alias}
                              {isAdmin && <CategoryAliasDeleteButton id={a.id} alias={a.alias} />}
                            </span>
                          ))}
                        </div>
                      )}
                      {isAdmin && <CategoryAliasAddForm categoryId={cat.id} />}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
