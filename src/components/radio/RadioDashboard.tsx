import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2, FileText, Megaphone, AlertTriangle, CheckCircle,
  XCircle, Clock, TrendingUp, DollarSign,
} from "lucide-react";
import { useAdvertisers, useContracts, useAds, useAdSchedule, useAdLogs } from "@/hooks/useRadioData";
import { getAlerts } from "@/lib/adScheduler";

export default function RadioDashboard() {
  const { data: advertisers = [] } = useAdvertisers();
  const { data: contracts = [] } = useContracts();
  const { data: ads = [] } = useAds();
  const today = new Date().toISOString().split("T")[0];
  const { data: schedule = [] } = useAdSchedule(today);
  const { data: logs = [] } = useAdLogs(today);

  const activeAdvertisers = advertisers.filter((a) => a.status === "active").length;
  const activeContracts = contracts.filter((c) => c.contract_status === "active").length;
  const expiredContracts = contracts.filter((c) => c.contract_status === "expired" || new Date(c.end_date) < new Date()).length;
  const expiringContracts = contracts.filter((c) => {
    const end = new Date(c.end_date);
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    return c.contract_status === "active" && end <= in7 && end >= new Date();
  }).length;
  const activeAds = ads.filter((a) => a.status === "active").length;
  const totalDailyNeeded = contracts.filter((c) => c.contract_status === "active").reduce((sum, c) => sum + c.daily_executions, 0);
  const executedToday = logs.filter((l) => l.status === "success").length;
  const monthlyRevenue = contracts
    .filter((c) => c.contract_status === "active")
    .reduce((sum, c) => sum + c.value_cents, 0) / 100;

  const alerts = getAlerts(contracts, ads as any, schedule.length, totalDailyNeeded);

  const stats = [
    { label: "Anunciantes Ativos", value: activeAdvertisers, icon: Building2, color: "text-primary" },
    { label: "Contratos Ativos", value: activeContracts, icon: FileText, color: "text-primary" },
    { label: "Anúncios Ativos", value: activeAds, icon: Megaphone, color: "text-primary" },
    { label: "Execuções Hoje", value: `${executedToday}/${totalDailyNeeded}`, icon: TrendingUp, color: "text-primary" },
    { label: "Faturamento Mensal", value: `R$ ${monthlyRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-primary" },
    { label: "A Vencer", value: expiringContracts, icon: Clock, color: "text-yellow-500" },
    { label: "Vencidos", value: expiredContracts, icon: XCircle, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex flex-col items-center text-center gap-1">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <span className="text-xl font-bold">{s.value}</span>
              <span className="text-[11px] text-muted-foreground leading-tight">{s.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Alerts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Alertas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-60">
              {alerts.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-primary" /> Tudo operacional
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant={a.type === "error" ? "destructive" : a.type === "warning" ? "secondary" : "default"} className="text-[10px] shrink-0">
                        {a.type === "error" ? "CRÍTICO" : a.type === "warning" ? "AVISO" : "INFO"}
                      </Badge>
                      <span>{a.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Today's Schedule Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Grade de Hoje ({schedule.length} anúncios)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-60">
              {schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum anúncio agendado para hoje.</p>
              ) : (
                <div className="space-y-1">
                  {schedule.slice(0, 15).map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <span className="font-mono text-xs">{s.scheduled_time?.substring(0, 5)}</span>
                      <span className="truncate flex-1 mx-2">{s.ad?.name || "—"}</span>
                      <Badge variant={s.execution_status === "played" ? "default" : s.execution_status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                        {s.execution_status === "played" ? "✓" : s.execution_status === "failed" ? "✗" : "⏳"}
                      </Badge>
                    </div>
                  ))}
                  {schedule.length > 15 && <p className="text-xs text-muted-foreground pt-1">+{schedule.length - 15} mais...</p>}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
