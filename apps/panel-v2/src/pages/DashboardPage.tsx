import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, CreditCard, MessageSquare, RefreshCcw, UserRoundX, Wallet } from "lucide-react";
import { toast } from "sonner";
import { usePanelData } from "@/hooks/use-panel-data";
import { formatDateTimeBr } from "@/lib/date-time";

function formatMoney(cents?: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function digitsOnly(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    user,
    chats,
    pixCharges,
    scaInactiveStudents,
    opsDailySummary,
    systemHealth,
    refreshPixCharges,
    refreshScaInactiveStudents,
    refreshOpsDailySummary: rawRefreshOpsDailySummary,
    confirmPixScaDone,
    retryPixCharge,
    selectChat,
    openConversationByPhone,
    sendScaReactivationBatch,
    loadScaReactivationStats,
  } = usePanelData();
  const refreshOpsDailySummary = rawRefreshOpsDailySummary || (async () => null);
  const isAdmin = user?.role === "admin";
  const [daysFilter, setDaysFilter] = useState("5");
  const [trendWindow, setTrendWindow] = useState<"d7" | "d30">("d7");
  const [reactivationTemplate, setReactivationTemplate] = useState("Oi {{nome}}, sentimos sua falta na academia. Vi que voce esta ha {{dias}} dias sem treinar. Posso te ajudar a voltar com seu plano {{plano}}?");
  const [reactivationMaxPerHour, setReactivationMaxPerHour] = useState("30");
  const [reactivationDelayMs, setReactivationDelayMs] = useState("700");
  const [reactivationStats, setReactivationStats] = useState<{ sentLastHour?: number; sentLast24h?: number; failedLast24h?: number } | null>(null);
  const [busyChargeId, setBusyChargeId] = useState(0);
  const [busyRetryChargeId, setBusyRetryChargeId] = useState(0);
  const [sendingReactivation, setSendingReactivation] = useState(false);
  const [loadingQueues, setLoadingQueues] = useState(false);
  const [inactiveSnapshot, setInactiveSnapshot] = useState<{ generatedAt?: number; cutoffAt?: number; days?: number; total?: number; windowDays?: number; windowStartAt?: number } | null>(null);
  const firstDaysFilterEffect = useRef(true);

  const runRefresh = async (daysOverride?: number) => {
    setLoadingQueues(true);
    const days = Math.max(1, Math.min(180, Number(daysOverride ?? daysFilter) || 5));
    try {
      const [, , inactiveMeta, stats] = await Promise.all([
        refreshOpsDailySummary(),
        refreshPixCharges(),
        refreshScaInactiveStudents(days, 200, "", 30),
        loadScaReactivationStats(),
      ]);
      setInactiveSnapshot(inactiveMeta ? {
        generatedAt: Number(inactiveMeta.generated_at || 0),
        cutoffAt: Number(inactiveMeta.cutoff_at || 0),
        days: Number(inactiveMeta.days || days),
        total: Number(inactiveMeta.total || 0),
        windowDays: Number(inactiveMeta.window_days || 30),
        windowStartAt: Number(inactiveMeta.window_start_at || 0),
      } : null);
      setReactivationStats(stats);
    } finally {
      setLoadingQueues(false);
    }
  };

  useEffect(() => {
    void runRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstDaysFilterEffect.current) {
      firstDaysFilterEffect.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void runRefresh();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysFilter]);

  const pixQueue = useMemo(
    () => (pixCharges || [])
      .filter((charge) => String(charge.status || "").toLowerCase() === "paid" && String(charge.sca_manual_status || "").toLowerCase() === "pending")
      .sort((left, right) => Number(right.paid_at || right.updated_at || right.created_at || 0) - Number(left.paid_at || left.updated_at || left.created_at || 0)),
    [pixCharges],
  );
  const pixFailedQueue = useMemo(
    () => (pixCharges || [])
      .filter((charge) => {
        const status = String(charge.status || "").toLowerCase();
        const hasError = String(charge.last_error || "").trim().length > 0;
        return hasError || status === "error" || status === "failed";
      })
      .sort((left, right) => Number(right.updated_at || right.created_at || 0) - Number(left.updated_at || left.created_at || 0))
      .slice(0, 20),
    [pixCharges],
  );

  const inactiveQueue = useMemo(
    () => [...(scaInactiveStudents || [])].sort((left, right) => Number(right.days_without_visit || 0) - Number(left.days_without_visit || 0)),
    [scaInactiveStudents],
  );

  const urgentChats = useMemo(
    () => (chats || []).filter((chat) => chat.attentionActive || chat.slaStatus === "critico" || chat.slaStatus === "atrasando").length,
    [chats],
  );

  const trendRows = useMemo(() => {
    const rows = (trendWindow === "d7" ? opsDailySummary?.trend?.d7 : opsDailySummary?.trend?.d30) || [];
    const max = rows.reduce((acc, row) => Math.max(acc, Number(row?.paid || 0), Number(row?.newStudents || 0)), 1);
    return rows.map((row) => ({
      date: row.date,
      paid: Number(row?.paid || 0),
      newStudents: Number(row?.newStudents || 0),
      paidWidth: `${Math.max(2, Math.round((Number(row?.paid || 0) / max) * 100))}%`,
      studentsWidth: `${Math.max(2, Math.round((Number(row?.newStudents || 0) / max) * 100))}%`,
    }));
  }, [opsDailySummary?.trend?.d30, opsDailySummary?.trend?.d7, trendWindow]);

  const openConversation = (contactId: string) => {
    if (!contactId) return;
    navigate("/atendimento");
    selectChat(contactId);
  };

  const openConversationFromStudent = async (phone: string, name: string) => {
    const digits = digitsOnly(phone);
    if (!digits || digits.length < 10) {
      toast.error("Aluno sem telefone valido.");
      return;
    }
    navigate("/atendimento");
    const existing = (chats || []).find((chat) => digitsOnly(chat.id || "").endsWith(digits) || digitsOnly(chat.id || "") === digits);
    if (existing?.id) {
      selectChat(existing.id);
      return;
    }
    const opened = await openConversationByPhone(digits, name);
    if (!opened) toast.error("Nao consegui abrir a conversa no painel.");
  };

  const completeScaCharge = async (chargeId: number) => {
    if (!chargeId || busyChargeId) return;
    setBusyChargeId(chargeId);
    try {
      const ok = await confirmPixScaDone(chargeId);
      if (ok) await refreshPixCharges();
    } finally {
      setBusyChargeId(0);
    }
  };

  const retryCharge = async (chargeId: number) => {
    if (!chargeId || busyRetryChargeId) return;
    setBusyRetryChargeId(chargeId);
    try {
      await retryPixCharge(chargeId);
      await refreshPixCharges();
    } finally {
      setBusyRetryChargeId(0);
    }
  };

  const sendReactivationBatch = async () => {
    if (!isAdmin || sendingReactivation) return;
    const targetIds = inactiveQueue
      .filter((student) => String(student.phone || "").replace(/\D+/g, "").length >= 10)
      .map((student) => Number(student.id || 0))
      .filter((id) => id > 0)
      .slice(0, 60);
    if (!targetIds.length) {
      toast.error("Nao ha alunos com telefone valido na fila atual.");
      return;
    }
    setSendingReactivation(true);
    try {
      const result = await sendScaReactivationBatch({
        studentIds: targetIds,
        template: reactivationTemplate,
        templateName: `dias_${Math.max(1, Number(daysFilter) || 5)}`,
        maxPerHour: Math.max(1, Math.min(200, Number(reactivationMaxPerHour) || 30)),
        delayMs: Math.max(0, Math.min(5000, Number(reactivationDelayMs) || 700)),
      });
      if (!result.ok) {
        toast.error(`Falha no disparo: ${result.error || "send_failed"}`);
      } else {
        toast.success(`Reativacao enviada: ${Number(result.sentCount || 0)} sucesso(s), ${Number(result.failedCount || 0)} falha(s).`);
      }
      const stats = await loadScaReactivationStats();
      setReactivationStats(stats);
      await runRefresh();
    } finally {
      setSendingReactivation(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Operacional</h1>
          <p className="text-sm text-muted-foreground">Fila diaria de cobranca e reativacao da academia.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {[5, 10, 15, 30].map((days) => (
              <Button key={`preset-${days}`} variant={Number(daysFilter) === days ? "default" : "outline"} size="sm" onClick={() => setDaysFilter(String(days))}>
                {days}d
              </Button>
            ))}
          </div>
          <Input
            type="number"
            min={1}
            max={180}
            value={daysFilter}
            onChange={(event) => setDaysFilter(event.target.value)}
            className="w-24"
            placeholder="Dias"
          />
          <Button variant="outline" className="gap-1" onClick={runRefresh} disabled={loadingQueues}>
            <RefreshCcw className="h-4 w-4" /> {loadingQueues ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conversas urgentes</CardDescription>
            <CardTitle className="text-3xl">{urgentChats}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={urgentChats > 0 ? "secondary" : "outline"}>{urgentChats > 0 ? "Requer atencao" : "Estavel"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pix pendente SCA</CardDescription>
            <CardTitle className="text-3xl">{pixQueue.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={pixQueue.length > 0 ? "secondary" : "outline"}>{pixQueue.length > 0 ? "Baixa manual pendente" : "Sem pendencias"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alunos sem vir</CardDescription>
            <CardTitle className="text-3xl">{inactiveQueue.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={inactiveQueue.length > 0 ? "secondary" : "outline"}>{`${Math.max(1, Number(daysFilter) || 5)} dias ou mais`}</Badge>
            {inactiveSnapshot?.generatedAt ? (
              <p className="mt-1 text-[11px] text-muted-foreground">Atualizado em {formatDateTimeBr(inactiveSnapshot.generatedAt, "-")}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pagamentos hoje</CardDescription>
            <CardTitle className="text-3xl">{Number(opsDailySummary?.pix?.paidToday || 0)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">Gerados: {Number(opsDailySummary?.pix?.generatedToday || 0)}</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardDescription>Novos alunos (7d)</CardDescription><CardTitle className="text-2xl">{Number(opsDailySummary?.kpis?.studentsNew7d || 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Alunos ativos</CardDescription><CardTitle className="text-2xl">{Number(opsDailySummary?.kpis?.studentsActive || 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Alunos inativos</CardDescription><CardTitle className="text-2xl">{Number(opsDailySummary?.kpis?.studentsInactive || 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Pix pagos (7d)</CardDescription><CardTitle className="text-2xl">{Number(opsDailySummary?.kpis?.pixPaid7d || 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Pix pendentes</CardDescription><CardTitle className="text-2xl">{Number(opsDailySummary?.kpis?.pixPending || 0)}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendencia operacional</CardTitle>
          <CardDescription>Comparativo diario de pagamentos Pix e novos alunos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={trendWindow === "d7" ? "default" : "outline"} onClick={() => setTrendWindow("d7")}>7 dias</Button>
            <Button size="sm" variant={trendWindow === "d30" ? "default" : "outline"} onClick={() => setTrendWindow("d30")}>30 dias</Button>
          </div>
          {trendRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados para tendencia.</p>
          ) : (
            <div className="space-y-2">
              {trendRows.map((row) => (
                <div key={row.date} className="rounded-md border p-2">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span>{row.date}</span>
                    <span>Pix: {row.paid} | Novos: {row.newStudents}</span>
                  </div>
                  <div className="h-2 rounded bg-muted overflow-hidden mb-1"><div className="h-full bg-emerald-500" style={{ width: row.paidWidth }} /></div>
                  <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-blue-500" style={{ width: row.studentsWidth }} /></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Fila de cobranca (Pix pago / baixa manual)</CardTitle>
            <CardDescription>Quando finalizar no SCA, confirme por aqui para notificar o aluno automaticamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pixQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma cobranca pendente de baixa manual.</p>
            ) : pixQueue.map((charge) => (
              <div key={charge.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Pendente SCA</Badge>
                  <Badge variant="outline">{formatMoney(charge.amount_cents)}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTimeBr(charge.paid_at || charge.updated_at || charge.created_at, "-")}</span>
                </div>
                <p className="text-sm font-medium">{charge.student_full_name || "Aluno sem nome"} - {charge.plan_name_snapshot || "Plano"}</p>
                <p className="text-xs text-muted-foreground">Contato: {charge.contact_name || charge.contact_id}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openConversation(charge.contact_id)}>
                    <MessageSquare className="h-4 w-4" /> Abrir conversa
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => retryCharge(Number(charge.id))} disabled={busyRetryChargeId === Number(charge.id)}>
                    {busyRetryChargeId === Number(charge.id) ? "Reprocessando..." : "Reprocessar cobranca"}
                  </Button>
                  <Button size="sm" className="gap-1" onClick={() => completeScaCharge(Number(charge.id))} disabled={busyChargeId === Number(charge.id)}>
                    <CheckCircle2 className="h-4 w-4" /> {busyChargeId === Number(charge.id) ? "Confirmando..." : "Confirmar baixa SCA"}
                  </Button>
                </div>
                {charge.last_error ? <p className="text-xs text-red-500">Ultimo erro Asaas: {charge.last_error}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> Falhas Pix recentes</CardTitle>
            <CardDescription>Motivo do Asaas e reprocessamento com 1 clique.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pixFailedQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma falha recente de cobranca.</p>
            ) : pixFailedQueue.map((charge) => (
              <div key={`failed-${charge.id}`} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">Falha</Badge>
                  <Badge variant="outline">{String(charge.status || "-")}</Badge>
                  <Badge variant="outline">{formatMoney(charge.amount_cents)}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTimeBr(charge.updated_at || charge.created_at, "-")}</span>
                </div>
                <p className="text-sm font-medium">{charge.student_full_name || charge.contact_name || charge.contact_id}</p>
                <p className="text-xs text-red-500">{charge.last_error || "Sem detalhe de erro."}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openConversation(charge.contact_id)}>
                    <MessageSquare className="h-4 w-4" /> Abrir conversa
                  </Button>
                  <Button size="sm" onClick={() => retryCharge(Number(charge.id))} disabled={busyRetryChargeId === Number(charge.id)}>
                    {busyRetryChargeId === Number(charge.id) ? "Reprocessando..." : "Reprocessar cobranca"}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><UserRoundX className="h-4 w-4" /> Fila de reativacao (alunos sem vir)</CardTitle>
          <CardDescription>Conta ausencia consecutiva ate hoje. Qualquer acesso no dia conta como visita.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {inactiveSnapshot?.cutoffAt ? (
            <p className="text-xs text-muted-foreground">
              Corte atual: {inactiveSnapshot.windowStartAt ? formatDateTimeBr(inactiveSnapshot.windowStartAt, "-") : "-"} (inclui hoje). Filtro: {Math.max(1, Number(inactiveSnapshot.days || daysFilter) || 5)} dias consecutivos ou mais sem acesso.
            </p>
          ) : null}
          {inactiveQueue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aluno acima do limite informado.</p>
          ) : inactiveQueue.map((student) => {
            return (
              <div key={`${student.id}-${student.external_id}`} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{Number(student.days_without_visit || 0)} dias sem vir</Badge>
                  {student.plan ? <Badge variant="outline">{student.plan}</Badge> : null}
                </div>
                <p className="text-sm font-medium">{student.name || "Aluno sem nome"}</p>
                <p className="text-xs text-muted-foreground">
                  Telefone: {student.phone || "-"} | Ultimo acesso: {student.last_access_at ? formatDateTimeBr(student.last_access_at, "-") : "Sem acesso registrado"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {String(student.phone || "").replace(/\D+/g, "").length >= 10 ? (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => void openConversationFromStudent(student.phone || "", student.name || "")}>
                      <MessageSquare className="h-4 w-4" /> Abrir chat no painel
                    </Button>
                  ) : (
                    <Badge variant="outline">Sem telefone</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campanhas de reativacao</CardTitle>
            <CardDescription>Envio de WhatsApp com template e limite por hora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Limite por hora</p>
                <Input type="number" min={1} max={200} value={reactivationMaxPerHour} onChange={(event) => setReactivationMaxPerHour(event.target.value)} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Delay entre envios (ms)</p>
                <Input type="number" min={0} max={5000} value={reactivationDelayMs} onChange={(event) => setReactivationDelayMs(event.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={sendReactivationBatch} disabled={sendingReactivation}>
                  {sendingReactivation ? "Enviando..." : "Enviar campanha da fila atual"}
                </Button>
              </div>
            </div>
            <Input value={reactivationTemplate} onChange={(event) => setReactivationTemplate(event.target.value)} />
            <p className="text-xs text-muted-foreground">Placeholders: {"{{nome}}"}, {"{{dias}}"}, {"{{plano}}"}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Enviados (1h): {Number(reactivationStats?.sentLastHour || 0)}</Badge>
              <Badge variant="outline">Enviados (24h): {Number(reactivationStats?.sentLast24h || 0)}</Badge>
              <Badge variant="outline">Falhas (24h): {Number(reactivationStats?.failedLast24h || 0)}</Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hardening de producao</CardTitle>
          <CardDescription>Saude operacional com diagnostico rapido.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!systemHealth?.components ? (
            <p className="text-sm text-muted-foreground">Diagnostico indisponivel no momento.</p>
          ) : (
            Object.entries(systemHealth.components).slice(0, 8).map(([key, component]) => (
              <div key={`health-${key}`} className="rounded-md border p-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{key}</p>
                  <p className="text-xs text-muted-foreground">{String(component?.message || "-")}</p>
                </div>
                <Badge variant={component?.status === "critical" ? "destructive" : component?.status === "degraded" ? "secondary" : "outline"}>
                  {String(component?.status || "ok")}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> Atalhos rapidos</CardTitle>
          <CardDescription>Acesso direto para as tarefas mais comuns do dia.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/atendimento")}>Ir para Atendimento</Button>
          <Button variant="outline" onClick={() => navigate("/sca")}>Importar SCA</Button>
          <Button variant="outline" onClick={() => navigate("/configuracoes")}>Configurar Pix e Contexto</Button>
        </CardContent>
      </Card>
    </div>
  );
}
