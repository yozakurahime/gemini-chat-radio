import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/panel-api";
import { usePanelData } from "@/hooks/use-panel-data";
import { formatDateTimeBr } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ConnectorDiagnosticItem = {
  id: number;
  connector: string;
  source: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  message: string;
  host: string;
  pid: number;
  created_at: number;
  meta?: Record<string, unknown>;
};

type StudentSyncStatus = {
  total: number;
  last_seen_at: number;
  with_cpf: number;
  with_phone: number;
};

type HealthLevel = "green" | "yellow" | "red";

function getLevelBadgeVariant(level: ConnectorDiagnosticItem["level"]) {
  if (level === "error") return "destructive";
  if (level === "warn") return "secondary";
  return "outline";
}

function computeHealth(items: ConnectorDiagnosticItem[]): { level: HealthLevel; reason: string } {
  if (!items.length) return { level: "yellow", reason: "Sem eventos recebidos ainda." };
  const now = Date.now();
  const latest = items[0];
  const latestAgeMin = (now - Number(latest.created_at || 0)) / 60000;
  const hasRecentError = items.some((item) => item.level === "error" && (now - Number(item.created_at || 0)) < (30 * 60 * 1000));
  const hasRecentWarn = items.some((item) => item.level === "warn" && (now - Number(item.created_at || 0)) < (30 * 60 * 1000));

  if (hasRecentError || latestAgeMin > 60) {
    return { level: "red", reason: hasRecentError ? "Erro recente do conector." : "Sem novo evento ha mais de 60 min." };
  }
  if (hasRecentWarn || latestAgeMin > 20) {
    return { level: "yellow", reason: hasRecentWarn ? "Aviso recente do conector." : "Sem novo evento ha mais de 20 min." };
  }
  return { level: "green", reason: "Conector enviando eventos normalmente." };
}

export default function RecepcaoSaudePage() {
  const { user } = usePanelData();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ConnectorDiagnosticItem[]>([]);
  const [status, setStatus] = useState<StudentSyncStatus | null>(null);
  const [errorText, setErrorText] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorText("");
    try {
      const [diagRes, statusRes] = await Promise.all([
        apiFetch("/admin/sca/connector/diagnostic?connector=sca-web-exporter&limit=80"),
        apiFetch("/admin/sca/students/sync/status"),
      ]);
      const diagData = await diagRes.json().catch(() => ({ items: [] }));
      const statusData = await statusRes.json().catch(() => ({}));
      setItems(Array.isArray(diagData?.items) ? diagData.items : []);
      setStatus({
        total: Number(statusData?.total || 0),
        last_seen_at: Number(statusData?.last_seen_at || 0),
        with_cpf: Number(statusData?.with_cpf || 0),
        with_phone: Number(statusData?.with_phone || 0),
      });
      setLastUpdatedAt(Date.now());
    } catch (error: any) {
      setErrorText(error?.code || "Falha ao carregar diagnostico.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadData();
    const timer = window.setInterval(() => { void loadData(); }, 15000);
    return () => window.clearInterval(timer);
  }, [loadData, user]);

  const health = useMemo(() => computeHealth(items), [items]);

  if (user?.role !== "admin") {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Saude da Recepcao</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Somente administradores podem acessar este painel.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Saude da Recepcao</h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento do conector de exportacao web do SCA.
          </p>
        </div>
        <Button onClick={() => void loadData()} disabled={loading} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conector</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {health.level === "green" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
              {health.level === "yellow" ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : null}
              {health.level === "red" ? <XCircle className="h-5 w-5 text-destructive" /> : null}
              <Badge variant={health.level === "red" ? "destructive" : health.level === "yellow" ? "secondary" : "outline"}>
                {health.level === "green" ? "Operacional" : health.level === "yellow" ? "Atencao" : "Critico"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{health.reason}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ultimo Evento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {items[0] ? `${items[0].event} (${items[0].level})` : "Sem dados"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {items[0]?.created_at ? formatDateTimeBr(items[0].created_at, "-") : "-"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Atualizado localmente: {lastUpdatedAt ? formatDateTimeBr(lastUpdatedAt, "-") : "-"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alunos Sincronizados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{status?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              CPF: {status?.with_cpf ?? 0} | Telefone: {status?.with_phone ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ultimo sync: {status?.last_seen_at ? formatDateTimeBr(status.last_seen_at, "-") : "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {errorText ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            Erro ao carregar dados: {errorText}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Eventos do Conector
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Host</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length ? items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs">{formatDateTimeBr(item.created_at, "-")}</TableCell>
                    <TableCell>
                      <Badge variant={getLevelBadgeVariant(item.level)}>{item.level}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{item.event}</TableCell>
                    <TableCell className="max-w-[520px] whitespace-pre-wrap break-words text-xs text-muted-foreground">{item.message}</TableCell>
                    <TableCell className="text-xs">{item.host || "-"}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      Nenhum evento recebido ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
