"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { narxReportSaqlaAction, narxReportYuborAction } from "./actions";

export function NarxReportEditor({
  tokenSet, chatId: initChat, topicId: initTopic, autoEnabled: initAuto, lastPeriod,
}: {
  tokenSet: boolean;
  chatId: string;
  topicId: string;
  autoEnabled: boolean;
  /** Oxirgi muvaffaqiyatli yuborilgan davr (serverda formatlangan) — FAQAT ko'rsatish uchun. */
  lastPeriod: string | null;
}) {
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState(initChat);
  const [topicId, setTopicId] = useState(initTopic);
  const [autoEnabled, setAutoEnabled] = useState(initAuto);
  // Saqlangan asos qiymatlar (save'dan keyin yangilanadi — dirty eskirmaydi)
  const [base, setBase] = useState({ chat: initChat, topic: initTopic, auto: initAuto });
  const [saving, startSave] = useTransition();
  const [sending, startSend] = useTransition();

  const dirty =
    token.trim() !== "" ||
    chatId.trim() !== base.chat.trim() ||
    topicId.trim() !== base.topic.trim() ||
    autoEnabled !== base.auto;

  const onSave = () =>
    startSave(async () => {
      const res = await narxReportSaqlaAction({ token, chatId, topicId, autoEnabled });
      if (res.ok) {
        toast.success("Sozlama saqlandi.");
        setToken("");
        setBase({ chat: chatId.trim(), topic: topicId.trim(), auto: autoEnabled });
      } else toast.error(res.error);
    });

  const onSend = () =>
    startSend(async () => {
      const res = await narxReportYuborAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // skipped — xato emas: ma'lumot yo'q yoki farqi 5% dan katta SKU topilmadi
      if (res.skipped) {
        toast.info(res.period
          ? `Yuborilmadi — ${res.period} davrida farqi 5% dan katta SKU topilmadi.`
          : "Yuborilmadi — sotuv ma'lumoti hali yuklanmagan.");
        return;
      }
      toast.success(`Yuborildi — ${res.count} ta SKU (davr: ${res.period}).`);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Avto-yuborish yoqilgan bo&apos;lsa, har kuni soat <b>11:00</b> (Toshkent) da{" "}
        <b>oxirgi yuklangan davr</b> bo&apos;yicha bir xil tovar filiallarda{" "}
        <b>5% dan ko&apos;proq</b> farqli narxda sotilayotgan holatlar PDF sifatida shu guruh
        topigiga yuboriladi. Yangi sotuv fayli yuklanmasa (davr o&apos;zgarmasa) — takror
        yuborilmaydi. Bot guruhga a&apos;zo va topikka yozish huquqiga ega bo&apos;lishi shart.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Bot token</Label>
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={tokenSet ? "•••••• (saqlangan — o'zgartirish uchun yangi token kiriting)" : "123456789:ABCdef..."}
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

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={autoEnabled}
          onChange={(e) => setAutoEnabled(e.target.checked)}
          disabled={saving}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        Har kuni avtomatik yuborilsin (11:00, Toshkent)
      </label>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={saving || !dirty} className="h-10 rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" /> Saqlash</>}
        </Button>
        <Button onClick={onSend} disabled={sending} variant="secondary" className="h-10 rounded-xl">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1.5 h-4 w-4" /> Hozir yuborish</>}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Oxirgi yuborilgan davr:{" "}
        {lastPeriod
          ? <b className="text-foreground">{lastPeriod}</b>
          : <span>hali yuborilmagan</span>}
      </p>
      <p className="text-[11px] text-muted-foreground">
        &quot;Hozir yuborish&quot; — joriy sozlama bilan sinov uchun darhol yuboradi (davr
        o&apos;zgarmagan bo&apos;lsa ham, avto-yuborish o&apos;chiq bo&apos;lsa ham yuboradi).
      </p>
    </div>
  );
}
