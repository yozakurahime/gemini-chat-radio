import { useState } from "react";
import { Calendar, Clock, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAdSchedule, useGenerateSchedule } from "@/hooks/useRadioData";

export default function AdScheduleView() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: schedule = [], isLoading } = useAdSchedule(date);
  const generateMut = useGenerateSchedule();

  const generate = async () => {
    await generateMut.mutateAsync({ date });
  };

  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const isToday = date === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button onClick={generate} disabled={generateMut.isPending}>
          {generateMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          Gerar grade
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Grade ({schedule.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !schedule.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum anuncio agendado.</p>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <div className="space-y-1">
                {schedule.map((row) => {
                  const hhmm = row.scheduled_time.slice(0, 5);
                  const isPast = isToday && hhmm < currentHHMM;
                  const isCurrent = isToday && hhmm === currentHHMM;
                  return (
                    <div
                      key={row.id}
                      className={`flex items-center gap-3 rounded-md border p-2.5 text-sm ${
                        isCurrent ? "border-primary/30 bg-primary/10" : isPast ? "opacity-60" : ""
                      }`}
                    >
                      <span className="w-12 shrink-0 font-mono text-xs">{hhmm}</span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{row.ad?.name || "Anuncio removido"}</span>
                        <span className="text-xs text-muted-foreground">{row.ad?.advertiser?.company_name || ""}</span>
                      </div>
                      <Badge variant={row.execution_status === "played" ? "default" : row.execution_status === "failed" ? "destructive" : "secondary"}>
                        {row.execution_status}
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
