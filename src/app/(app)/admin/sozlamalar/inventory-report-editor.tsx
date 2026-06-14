"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { inventoryReportSaqlaAction, inventoryReportYuborAction } from "./actions";

export function InventoryReportEditor({
  tokenSet, chatId: initChat, topicId: initTopic,
}: { tokenSet: boolean; chatId: string; topicId: string }) {
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState(initChat);
  const [topicId, setTopicId] = useState(initTopic);
  // Saqlangan asos qiymatlar (save'dan keyin yangilanadi — dirty eskirmaydi)
  const [base, setBase] = useState({ chat: initChat, topic: initTopic });
  const [saving, startSave] = useTransition();
  const [sending, startSend] = useTransition();

  const dirty =
    token.trim() !== "" || chatId.trim() !== base.chat.trim() || topicId.trim() !== base.topic.trim();

  const onSave = () =>
    startSave(async () => {
      const res = await inventoryReportSaqlaAction({ token, chatId, topicId });
      if (res.ok) {
        toast.success("Sozlama saqlandi.");
        setToken("");
        setBase({ chat: chatId.trim(), topic: topicId.trim() });
      } else toast.error(res.error);
    });

  const onSend = () =>
    startSend(async () => {
      const res = await inventoryReportYuborAction();
      if (res.ok) {
        toast.success(res.count > 0
          ? `Yuborildi — ${res.count} ta muammoli SKU.`
          : "Yuborildi — muammoli tovar topilmadi.");
      } else toast.error(res.error);
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Har kuni soat <b>14:00</b> (Toshkent) da <b>bir kun oldingi (kecha)</b> holatiga ko&apos;ra
        qoldig&apos;i <b>0 yoki minus</b>, lekin <b>sotuvi bor</b> muammoli tovarlar ro&apos;yxati Excel
        sifatida shu guruh topigiga yuboriladi (ma&apos;lumot kuni xabarda ko&apos;rsatiladi). Bot guruhga
        a&apos;zo va topikka yozish huquqiga ega bo&apos;lishi shart.
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

      <div className="flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={saving || !dirty} className="h-10 rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" /> Saqlash</>}
        </Button>
        <Button onClick={onSend} disabled={sending} variant="secondary" className="h-10 rounded-xl">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1.5 h-4 w-4" /> Hozir yuborish</>}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        &quot;Hozir yuborish&quot; — joriy sozlama bilan sinov uchun darhol yuboradi (jadvalни kutmaydi).
      </p>
    </div>
  );
}
