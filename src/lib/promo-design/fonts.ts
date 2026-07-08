/**
 * Dizayn banner shriftlari (ImageResponse `fonts` uchun):
 *   VelaSans — matn (default), Golos — raqamlar (narx, foiz, limit).
 * Bold/Medium kesimlar dizayner bergan fayllar (repo ildizidagi Fonts/ dan ko'chirilgan).
 * Golos'ning YAGONA kesimi Medium (500) — satori har qanday weight so'rovini shunga
 * moslaydi (sintetik bold yo'q). Fayllar: public/fonts/ (OFL). Node runtime shart (fs).
 */
import { readFile } from "fs/promises";
import path from "path";

const font = (file: string) => readFile(path.join(process.cwd(), "public/fonts", file));

export async function loadDesignFonts() {
  const [velaReg, velaBold, golosMed] = await Promise.all([
    font("VelaSans-Regular.otf"),
    font("VelaSans-Bold.ttf"),
    font("GolosText-Medium.ttf"),
  ]);
  return [
    { name: "VelaSans", data: velaReg, weight: 400 as const, style: "normal" as const },
    { name: "VelaSans", data: velaBold, weight: 700 as const, style: "normal" as const },
    { name: "Golos", data: golosMed, weight: 500 as const, style: "normal" as const },
  ];
}
