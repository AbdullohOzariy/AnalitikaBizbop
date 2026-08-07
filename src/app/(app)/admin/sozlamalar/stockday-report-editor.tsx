"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { stockdayReportSaqlaAction, stockdayReportYuborAction } from "./actions";

/**
 * Zaxira normasi hisoboti sozlamasi.
 *
 * `normaSoni` — nechta kategoriyaga norma qo'yilgani. 0 bo'lsa hisobot bo'sh
 * chiqadi, shuning uchun ogohlantiriladi: aks holda "nega hech narsa kelmadi"
 * degan savol paydo bo'lardi.
 */
export function StockdayReportEditor({
  tokenSet,
  chatId: initChat,
  topicId: initTopic,
  autoEnabled: initAuto,
  excludeCodes: initSkip,
  normaSoni,
}: {
  tokenSet: boolean;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
  excludeCodes: string;
  normaSoni: number;
}) {
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState(initChat);
  const [topicId, setTopicId] = useState(initTopic);
  const [autoEnabled, setAutoEnabled] = useState(initAuto);
  const [excludeCodes, setExcludeCodes] = useState(initSkip);
  const [base, setBase] = useState({
    chat: initChat, topic: initTopic, auto: initAuto, skip: initSkip,
  });
  const [saving, startSave] = useTransition();
  const [sending, startSend] = useTransition();

  const dirty =
    token.trim() !== "" ||
    chatId.trim() !== base.chat.trim() ||
    topicId.trim() !== base.topic.trim() ||
    excludeCodes.trim() !== base.skip.trim() ||
    autoEnabled !== base.auto;

  const onSave = () =>
    startSave(async () => {
      const res = await stockdayReportSaqlaAction({
        token, chatId, topicId, autoEnabled, excludeCodes,
      });
      if (res.ok) {
        toast.success("Sozlama saqlandi.");
        setToken("");
        setBase({
          chat: chatId.trim(), topic: topicId.trim(),
          auto: autoEnabled, skip: excludeCodes.trim(),
        });
      } else toast.error(res.error);
    });

  const onSend = () =>
    startSend(async () => {
      const res = await stockdayReportYuborAction();
      if (res.ok) {
        toast.success(
          res.count > 0
            ? `Yuborildi — ${res.count.toLocaleString("uz-UZ")} ta qator normadan oshgan.`
            : "Yuborildi — normadan oshgan tovar yo'q."
        );
      } else toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Zaxira kunlari <b>belgilangan normadan oshgan</b> tovarlar (SKU × filial) Excel
        sifatida shu guruh topigiga yuboriladi. Norma kategoriya bo&apos;yicha qo&apos;yiladi:
        subkategoriya → ota kategoriya → global standart. Ro&apos;yxat <b>ortiqcha kapital</b>{" "}
        bo&apos;yicha saralanadi — eng ko&apos;p pul turib qolgani yuqorida.
      </p>

      {normaSoni === 0 ? (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/[0.09] px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Hech bir kategoriyaga norma qo&apos;yilmagan — hisobot bo&apos;sh chiqadi.
            Avval <Link href="/stockday" className="underline">Zaxira kunlari</Link> bo&apos;limida
            normalarni kiriting.
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          <b>{normaSoni.toLocaleString("uz-UZ")}</b> ta kategoriyaga norma qo&apos;yilgan.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Bot token</Label>
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={
              tokenSet
                ? "•••••• (saqlangan — o'zgartirish uchun yangi token kiriting)"
                : "123456789:ABCdef..."
            }
            disabled={saving}
            className="h-10 rounded-xl font-mono"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Guruh chat ID</Label>
          <Input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="-100xxxxxxxxxx"
            disabled={saving}
            className="h-10 rounded-xl font-mono"
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Topic ID (ixtiyoriy)</Label>
          <Input
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            placeholder="masalan 12"
            disabled={saving}
            className="h-10 rounded-xl font-mono"
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Hisobotdan chiqariladigan tovar kodlari
        </Label>
        <textarea
          value={excludeCodes}
          onChange={(e) => setExcludeCodes(e.target.value)}
          placeholder="36919, 36920, 51325, 51326"
          disabled={saving}
          rows={2}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Tovar bo&apos;lmagan qatorlar uchun — masalan yetkazib berish xizmati
          (qoldig&apos;i shartli 100 000 qilib qo&apos;yilgan). Vergul yoki bo&apos;shliq
          bilan ajrating.{" "}
          <b>Arxivlash bu yerda yordam bermaydi:</b> bunday qatorlar har kuni sotiladi,
          sotuv fayli yuklanganda esa arxivdagi SKU avtomatik aktivga qaytariladi.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={autoEnabled}
          onChange={(e) => setAutoEnabled(e.target.checked)}
          disabled={saving}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        Har kuni avtomatik yuborilsin (14:00, Toshkent)
      </label>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={saving || !dirty} className="h-10 rounded-xl">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" /> Saqlash
            </>
          )}
        </Button>
        <Button onClick={onSend} disabled={sending} variant="secondary" className="h-10 rounded-xl">
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="mr-1.5 h-4 w-4" /> Hozir yuborish
            </>
          )}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        &quot;Hozir yuborish&quot; — joriy sozlama bilan sinov uchun darhol yuboradi
        (jadvalni va avto-yoqishni kutmaydi).
      </p>
    </div>
  );
}
