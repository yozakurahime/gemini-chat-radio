import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, RefreshCw, Clock, Loader2 } from "lucide-react";
import { useAdSchedule, useCreateScheduleEntries, useAds, useContracts, useRadioSettings } from "@/hooks/useRadioData";
import { generateDailySchedule } from "@/lib/adScheduler";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const statusIcons: Record<string, string> = { pending: "⏳", played: "✅", skipped: "⏭️", failed: "❌" };

export default function AdScheduleView() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: schedule = [], isLoading, refetch } = useAdSchedule(date);
  const { data: ads = [] } = useAds();
  const { data: contracts = [] } = useContracts();
  const { data: settings } = useRadioSettings();
  const createEntries = useCreateScheduleEntries();
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (!settings) { toast.error("Configurações não carregadas"); return; }
    setGenerating(true);
    try {
      // Clear existing pending entries for this date
      await supabase.from("ad_schedule").delete().eq("schedule_date", date).eq("execution_status", "pending");
      
      const entries = generateDailySchedule(ads as any, contracts, settings, date);
      if (entries.length === 0) {
        toast.warning("Nenhum anúncio elegível para agendar.");
      } else {
        await createEntries.mutateAsync(entries);
      }
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
    setGenerating(false);
  };

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const isToday = date === new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <Button onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Gerar Grade
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Grade do Dia — {new Date(date + "T12:00:00").toLocaleDateString("pt-BR")} ({schedule.length} anúncios)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : schedule.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum anúncio agendado. Clique em "Gerar Grade" para criar.</p>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-1">
                {schedule.map((s) => {
                  const isPast = isToday && s.scheduled_time?.substring(0, 5) < currentTime;
                  const isCurrent = isToday && s.scheduled_time?.substring(0, 5) === currentTime;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 p-2.5 rounded-md border text-sm transition-colors ${
                        isCurrent ? "bg-primary/10 border-primary/30" :
                        isPast ? "opacity-60" : ""
                      }`}
                    >
                      <span className="font-mono text-xs w-12 shrink-0">{s.scheduled_time?.substring(0, 5)}</span>
                      <span className="text-base">{statusIcons[s.execution_status]}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{s.ad?.name || "Anúncio removido"}</span>
                        <span className="text-xs text-muted-foreground">{s.ad?.advertiser?.company_name || ""}</span>
                      </div>
                      <Badge variant={s.execution_status === "played" ? "default" : s.execution_status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                        {s.execution_status === "pending" ? "Pendente" : s.execution_status === "played" ? "Executado" : s.execution_status === "failed" ? "Falhou" : "Pulado"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
