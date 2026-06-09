import { useState, useEffect } from "react";
import { CalendarIcon, Clock, Send, Loader2, CheckCircle2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface PostSchedule {
  id: number;
  day: number;
  platform: string;
  hook: string;
  scheduledAt: string | null;
  publishStatus: string;
}

interface ScheduleResult {
  message: string;
  scheduleStart: string;
  scheduleEnd: string;
  posts: PostSchedule[];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-SA", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  draft: "text-gray-500",
  scheduled: "text-blue-600",
  published: "text-green-600",
  failed: "text-red-600",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  scheduled: "مجدولة",
  published: "منشورة",
  failed: "فشل النشر",
};

export function ScheduleCampaignDialog({
  campaignId,
  postCount,
  open,
  onClose,
  onScheduled,
}: {
  campaignId: number;
  postCount: number;
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const { toast } = useToast();
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const endDefault = new Date(today);
  endDefault.setDate(endDefault.getDate() + Math.max(postCount - 1, 0));
  const endStr = endDefault.toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(endStr);
  const [publishHour, setPublishHour] = useState("9");
  const [publishMinute, setPublishMinute] = useState("0");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScheduleResult | null>(null);

  useEffect(() => {
    if (open) {
      setResult(null);
      setStartDate(todayStr);
      const end = new Date(todayStr);
      end.setDate(end.getDate() + Math.max(postCount - 1, 0));
      setEndDate(end.toISOString().split("T")[0]);
    }
  }, [open, postCount]);

  useEffect(() => {
    if (!startDate) return;
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(postCount - 1, 0));
    setEndDate(end.toISOString().split("T")[0]);
  }, [startDate, postCount]);

  async function handleSchedule() {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/campaigns/${campaignId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          publishHour: parseInt(publishHour),
          publishMinute: parseInt(publishMinute),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "فشل الجدولة");
      const data: ScheduleResult = await res.json();
      setResult(data);
      toast({ title: "تم جدولة الحملة بنجاح", description: `${data.posts.length} منشور تم جدولته.` });
      onScheduled();
    } catch (err) {
      toast({ title: "خطأ في الجدولة", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const totalDays = Math.max(
    Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1,
    postCount
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            جدولة الحملة الإعلانية
          </DialogTitle>
          <DialogDescription>
            حدد تاريخ بداية ونهاية النشر وسيتم توزيع {postCount} منشور تلقائياً.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" /> تاريخ البداية
                </Label>
                <Input
                  type="date"
                  value={startDate}
                  min={todayStr}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" /> تاريخ النهاية
                </Label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> وقت النشر اليومي
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min="0" max="23"
                  value={publishHour}
                  onChange={e => setPublishHour(e.target.value)}
                  className="w-20 text-center"
                  placeholder="09"
                />
                <span className="text-muted-foreground font-bold">:</span>
                <Input
                  type="number" min="0" max="59" step="5"
                  value={publishMinute}
                  onChange={e => setPublishMinute(e.target.value)}
                  className="w-20 text-center"
                  placeholder="00"
                />
                <span className="text-sm text-muted-foreground">بتوقيت الخادم (UTC)</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
              <p className="text-sm font-semibold">ملخص الجدولة</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-primary">{postCount}</p>
                  <p className="text-xs text-muted-foreground">منشور</p>
                </div>
                <div className="p-2 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-primary">{totalDays}</p>
                  <p className="text-xs text-muted-foreground">يوم</p>
                </div>
                <div className="p-2 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-primary">
                    {postCount > 1 ? Math.round(totalDays / (postCount - 1)) : totalDays}
                  </p>
                  <p className="text-xs text-muted-foreground">أيام بين المنشورات</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">إلغاء</Button>
              <Button onClick={handleSchedule} disabled={loading || !startDate || !endDate} className="flex-1">
                {loading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />جاري الجدولة...</>
                  : <><Send className="w-4 h-4 mr-2" />جدولة الحملة</>
                }
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">تم جدولة الحملة بنجاح</p>
                <p className="text-xs">من {new Date(result.scheduleStart).toLocaleDateString("ar-SA")} إلى {new Date(result.scheduleEnd).toLocaleDateString("ar-SA")}</p>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {result.posts
                .filter(p => p.scheduledAt)
                .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
                .map(post => (
                  <div key={post.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-muted-foreground w-12 shrink-0">يوم {post.day}</span>
                      <span className="truncate text-muted-foreground">{post.hook?.slice(0, 40)}...</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{formatDate(post.scheduledAt)}</span>
                      <span className={`text-xs font-medium ${STATUS_COLORS[post.publishStatus] ?? "text-gray-500"}`}>
                        {STATUS_LABELS[post.publishStatus] ?? post.publishStatus}
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            <Button onClick={onClose} className="w-full">إغلاق</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { STATUS_COLORS, STATUS_LABELS, formatDate };
