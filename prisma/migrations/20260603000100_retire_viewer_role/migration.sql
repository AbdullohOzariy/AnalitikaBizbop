-- VIEWER eskirdi — mavjud VIEWER foydalanuvchilar CAT_MANAGER'ga o'tkaziladi.
-- Admin keyin kerakli ularni CEO'ga ko'taradi. (Enum qiymati dormant qoladi.)
UPDATE "User" SET "role" = 'CAT_MANAGER' WHERE "role" = 'VIEWER';
