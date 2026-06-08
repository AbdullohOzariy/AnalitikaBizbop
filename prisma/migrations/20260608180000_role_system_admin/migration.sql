-- Eski ADMIN → SYSTEM_ADMIN (mavjud adminlar avtomatik to'liq huquqli bo'lib qoladi)
ALTER TYPE "Role" RENAME VALUE 'ADMIN' TO 'SYSTEM_ADMIN';

-- Yangi ADMIN (read-only) qiymatini qo'shamiz
ALTER TYPE "Role" ADD VALUE 'ADMIN';
