import { auth } from "@/auth";

export class AuthorizationError extends Error {
  constructor(message = "Ruxsat yo'q") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new AuthorizationError();
  }
  return session.user;
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new AuthorizationError();
  return session.user;
}
