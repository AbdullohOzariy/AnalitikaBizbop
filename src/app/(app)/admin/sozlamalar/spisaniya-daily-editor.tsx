"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { spisaniyaDailySaqlaAction, spisaniyaDailyYuborAction } from "./actions";

export function SpisaniyaDailyEditor({
  tokenSet, chatId: initChat, topicId: initTopic, autoEnabled: initAuto,
}: { tokenSet: boolean; chatId: string; topicId: string; autoEnabled: boolean }) {
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState(initChat);
  const [topicId, setTopicId] = useState(initTopic);
  const [autoEnabled, setAutoEnabled] = useState(initAuto);
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
      const res = await spisaniyaDailySaqlaAction({ token, chatId, topicId, autoEnabled });
      if (res.ok) {
        toast.success("Sozlama saqlandi.");
        setToken("");
        setBase({ chat: chatId.trim(), topic: topicId.trim(), auto: autoEnabled });
      } else toast.error(res.error);
    });

  const onSend = () =>
    startSend(async () => {
      const res = await spisaniyaDailyYuborAction();
      if (res.ok) {
        toast.success(res.total > 0 ? `Yuborildi — jami chiqim ${res.total.toLocaleString("uz-UZ")} so'm.` : "Yuborildi — kecha chiqim bo'lmagan.");
      } else toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Har kuni <b>09:30</b> (Toshkent) <b>kechagi kun</b> bo&apos;yicha eng xavfli <b>subkategoriya</b> va
        eng xavfli <b>filial</b> (chiqim summasi + soni) shu guruh topigiga yuboriladi.
        Bot guruhga a&apos;zo va topikka yozish huquqiga ega bo&apos;lishi shart.
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
          <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="-100xxxxxxxxxx"
            disabled={saving} className="h-10 rounded-xl font-mono" inputMode="numeric" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Topic ID (ixtiyoriy)</Label>
          <Input value={topicId} onChange={(e) => setTopicId(e.target.value)} placeholder="masalan 12"
            disabled={saving} className="h-10 rounded-xl font-mono" inputMode="numeric" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={autoEnabled} onChange={(e) => setAutoEnabled(e.target.checked)}
          disabled={saving} className="h-4 w-4 rounded border-border accent-primary" />
        Har kuni avtomatik yuborilsin (09:30, Toshkent)
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
        &quot;Hozir yuborish&quot; — joriy sozlama bilan kechagi kun hisobotini darhol yuboradi (sinov uchun).
      </p>
    </div>
  );
}
