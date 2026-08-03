import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { landingPathFor } from "@/lib/roles";

// Ildiz sahifa — rolga mos boshlang'ich bo'limga yo'naltiradi.
// Ilgari bu yerda shartsiz redirect("/dashboard") turardi: analitika ko'ra
// olmaydigan rol uchun "/" → "/dashboard" → guard fail → "/" cheksiz halqa hosil
// bo'lardi. landingPathFor bunday rolga hech qachon "/dashboard" qaytarmaydi.
export default async function Home() {
  const session = await auth();
  redirect(landingPathFor(session?.user?.roles));
}
