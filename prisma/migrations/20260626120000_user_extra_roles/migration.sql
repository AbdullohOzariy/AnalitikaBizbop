-- Bir kishiga ko'p rol: asosiy role + qo'shimcha extraRoles[] (union ruxsat)
ALTER TABLE "User" ADD COLUMN "extraRoles" "Role"[] NOT NULL DEFAULT '{}';
