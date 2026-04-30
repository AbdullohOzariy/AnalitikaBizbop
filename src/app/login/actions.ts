"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function signInAction(input: {
  email: string;
  password: string;
  callbackUrl?: string;
}): Promise<{ error?: string; redirectTo?: string }> {
  try {
    await signIn("credentials", {
      email: input.email,
      password: input.password,
      redirect: false,
    });
    return { redirectTo: input.callbackUrl ?? "/dashboard" };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "Email yoki parol noto'g'ri." };
      }
      return { error: "Kirish xatoligi yuz berdi." };
    }
    throw error;
  }
}
