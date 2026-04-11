import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Clock,
  DollarSign,
  FileText,
  Megaphone,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useAdLogs, useAdSchedule, useAds, useAdvertisers, useContracts } from "@/hooks/useRadioData";

function isExpiring(endDate: string) {
  const end = new Date(`${endDate}T23:59:59`);
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  return end >= new Date() && end <= in7;
}

export default function RadioDashboard() {
  const { data: advertisers = [] } = useAdvertisers();
  const { data: contracts = [] } = useContracts();
  const { data: ads = [] } = useAds();
  const today = new Date().toISOString().slice(0, 10);
  const { data: schedule = [] } = useAdSchedule(today);
  const { data: logs = [] } = useAdLogs(today);

  const activeAdvertisers = advertisers.filter((a) => a.status === "active").length;
  const activeContracts = contracts.filter((c) => c.contract_status === "active").length;
  const expiredContracts = contracts.filter((c) => c.contract_status === "expired" || new Date(`${c.end_date}T23:59:59`) < new Date()).length;
  const expiringContracts = contracts.filter((c) => c.contract_status === "active" && isExpiring(c.end_date)).length;
  const activeAds = ads.filter((a) => a.status === "active").length;
  const totalDailyNeeded = contracts
    .filter((c) => c.contract_status === "active" && c.payment_status !== "overdue")
    .reduce((sum, c) => sum + Number(c.daily_executions || 0), 0);
  const executedToday = logs.filter((l) => l.status === "success").length;
  const monthlyRevenue = contracts
    .filter((c) => c.contract_status === "active")
    .reduce((sum, c) => sum + Number(c.value_cents || 0), 0) / 100;

  const alerts: Array<{ type: "warning" | "error"; message: string }> = [];
  contracts.forEach((c) => {
    if (c.contract_status === "active" && c.payment_status === "overdue") {
      alerts.push({ type: "error", message: `Inadimplente: ${c.plan_name}` });
    }
    if (c.contract_status === "active" && isExpiring(c.end_date)) {
      alerts.push({ type: "warning", message: `Contrato vencendo: ${c.plan_name}` });
    }
  });
  if (schedule.length < totalDailyNeeded) {
    alerts.push({ type: "warning", message: `Grade insuficiente: ${schedule.length}/${totalDailyNeeded}` });
  }

  const stats = [
    { label: "Anunciantes ativos", value: activeAdvertisers, icon: Building2 },
    { label: "Contratos ativos", value: activeContracts, icon: FileText },
    { label: "Anuncios ativos", value: activeAds, icon: Megaphone },
    { label: "Execucoes hoje", value: `${executedToday}/${totalDailyNeeded}`, icon: TrendingUp },
    { label: "Faturamento mensal", value: `R$ ${monthlyRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign },
    { label: "A vencer", value: expiringContracts, icon: Clock },
    { label: "Vencidos", value: expiredContracts, icon: XCircle },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <s.icon className="mx-auto mb-1 h-5 w-5 text-primary" />
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Alertas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-60">
              {!alerts.length ? (
                <p className="text-sm text-muted-foreground">Tudo operacional.</p>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a, idx) => (
                    <div key={`${a.message}-${idx}`} className="flex items-start gap-2 text-sm">
                      <Badge variant={a.type === "error" ? "destructive" : "secondary"}>{a.type === "error" ? "CRITICO" : "AVISO"}</Badge>
                      <span>{a.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Grade de hoje ({schedule.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-60">
              {!schedule.length ? (
                <p className="text-sm text-muted-foreground">Sem grade para hoje.</p>
              ) : (
                <div className="space-y-1">
                  {schedule.slice(0, 15).map((item) => (
                    <div key={item.id} className="flex items-center justify-between border-b py-1 text-sm last:border-b-0">
                      <span className="font-mono text-xs">{item.scheduled_time.slice(0, 5)}</span>
                      <span className="mx-2 flex-1 truncate">{item.ad?.name || "Anuncio removido"}</span>
                      <Badge variant={item.execution_status === "played" ? "default" : item.execution_status === "failed" ? "destructive" : "secondary"}>
                        {item.execution_status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
