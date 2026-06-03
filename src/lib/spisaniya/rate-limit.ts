/**
 * Oddiy in-memory rate limiter (fixed window). Bitta Railway instansiyasi uchun yetarli.
 * Ko'p instansiyali deploy bo'lsa — Redis/Upstash kerak bo'ladi (hozir bitta instansiya).
 */
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();

/** true = ruxsat berildi, false = limit oshib ketdi. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  // Vaqti-vaqti bilan eskirgan kalitlarni tozalaymiz (xotira o'smasligi uchun).
  if (buckets.size > 5000 && Math.random() < 0.02) {
    for (const [k, b] of buckets) if (now >= b.reset) buckets.delete(k);
  }

  const b = buckets.get(key);
  if (!b || now >= b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

/** So'rovdan mijoz IP'sini oladi (proxy header'lari orqali). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
