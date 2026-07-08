/**
 * Dizayn banner shriftlari (ImageResponse `fonts` uchun):
 *   VelaSans — matn (default), Golos — raqamlar (narx, foiz, limit).
 * Ikkalasi ham dizayner bergan YAGONA kesim (Fonts/ dan ko'chirilgan): VelaSans Bold (700)
 * va Golos Text Medium (500) — satori har qanday weight so'rovini shu kesimlarga moslaydi,
 * ya'ni BARCHA matn Bold'da, BARCHA raqam Medium'da chiqadi (sintetik vazn yo'q).
 * Fayllar: public/fonts/ (OFL). Node runtime shart (fs).
 */
import { readFile } from "fs/promises";
import path from "path";

const font = (file: string) => readFile(path.join(process.cwd(), "public/fonts", file));

export async function loadDesignFonts() {
  const [velaBold, golosMed] = await Promise.all([
    font("VelaSans-Bold.ttf"),
    font("GolosText-Medium.ttf"),
  ]);
  return [
    { name: "VelaSans", data: velaBold, weight: 700 as const, style: "normal" as const },
    { name: "Golos", data: golosMed, weight: 500 as const, style: "normal" as const },
  ];
}
