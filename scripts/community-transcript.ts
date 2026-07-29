/**
 * Transkriptni KO'Z BILAN tekshirish uchun — Gemini chaqirilmaydi, DB'ga yozilmaydi.
 *
 *   npx tsx scripts/community-transcript.ts 2026-07-28
 *   npx tsx scripts/community-transcript.ts 2026-07-28 --ops 123456,789012
 *
 * Operator ID larini bilmasangiz, avval --kim bilan ishtirokchilarni ko'ring:
 *   npx tsx scripts/community-transcript.ts 2026-07-28 --kim
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildWindows, type Msg } from "../src/lib/community/transcript";

const args = process.argv.slice(2);
const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const kimRejim = args.includes("--kim");
const opsIdx = args.indexOf("--ops");
const opsRaw = opsIdx >= 0 ? args[opsIdx + 1] : process.env.COMMUNITY_OPERATOR_IDS || "";

if (!day) {
  console.error("Foydalanish: npx tsx scripts/community-transcript.ts YYYY-MM-DD [--ops id,id] [--kim]");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.tgGroupMessage.findMany({
    where: { dayKey: day },
    orderBy: [{ sentAt: "asc" }, { messageId: "asc" }],
    select: {
      messageId: true,
      sentAt: true,
      fromId: true,
      fromName: true,
      fromBot: true,
      text: true,
      mediaKind: true,
      replyToId: true,
      editedAt: true,
    },
  });

  if (rows.length === 0) {
    console.log(`${day}: xabar yo'q`);
    return;
  }

  if (kimRejim) {
    const kim = new Map<string, { nom: string; n: number }>();
    for (const r of rows) {
      const k = r.fromId?.toString() ?? "?";
      const v = kim.get(k) ?? { nom: r.fromName ?? "—", n: 0 };
      v.n++;
      kim.set(k, v);
    }
    console.log(`${day} — ishtirokchilar (operator ID sini shu yerdan oling):`);
    [...kim.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .forEach(([id, v]) => console.log(`  ${id.padStart(12)}  ${String(v.n).padStart(3)} ta  ${v.nom}`));
    return;
  }

  const ops = new Set(
    opsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => BigInt(s))
  );
  if (ops.size === 0) {
    console.warn("⚠️  Operator ID berilmadi (--ops yoki COMMUNITY_OPERATOR_IDS) — hamma MIJOZ deb belgilanadi.\n");
  }

  const windows = buildWindows(rows as Msg[], ops);
  console.log(
    `${day}: ${rows.length} xabar → filtrdan keyin ${windows.reduce((s, w) => s + w.msgCount, 0)} ` +
      `→ ${windows.length} oyna\n`
  );

  for (const w of windows) {
    console.log(`─── oyna #${w.seq}  (${w.msgCount} core, ${w.all.length} jami, hash ${w.inputHash.slice(0, 8)}) ───`);
    console.log(w.text);
    console.log();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
