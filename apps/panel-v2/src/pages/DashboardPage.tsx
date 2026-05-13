import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, CreditCard, MessageSquare, RefreshCcw, UserRoundX, Wallet } from "lucide-react";
import { usePanelData } from "@/hooks/use-panel-data";
import { formatDateTimeBr } from "@/lib/date-time";

function formatMoney(cents?: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function digitsOnly(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

function buildWhatsappLink(phone: string, studentName: string) {
  const digits = digitsOnly(phone);
  if (!digits) return "";
  const text = encodeURIComponent(`Oi ${studentName || "tudo bem"}! Sentimos sua falta na academia. Posso te ajudar com algo?`);
  return `https://wa.me/${digits}?text=${text}`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    user,
    chats,
    pixCharges,
    scaInactiveStudents,
    opsDailySummary,
    refreshPixCharges,
    refreshScaInactiveStudents,
    refreshOpsDailySummary: rawRefreshOpsDailySummary,
    confirmPixScaDone,
    selectChat,
  } = usePanelData();
  const refreshOpsDailySummary = rawRefreshOpsDailySummary || (async () => null);
  const isAdmin = user?.role === "admin";
  const [daysFilter, setDaysFilter] = useState("5");
  const [busyChargeId, setBusyChargeId] = useState(0);
  const [loadingQueues, setLoadingQueues] = useState(false);

  const runRefresh = async () => {
    setLoadingQueues(true);
    const days = Math.max(1, Math.min(180, Number(daysFilter) || 5));
    try {
      await Promise.all([
        refreshOpsDailySummary(),
        refreshPixCharges({ status: "paid", sca_manual_status: "pending" }),
        refreshScaInactiveStudents(days, 200, ""),
      ]);
    } finally {
      setLoadingQueues(false);
    }
  };

  useEffect(() => {
    void runRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pixQueue = useMemo(
    () => (pixCharges || [])
      .filter((charge) => String(charge.sca_manual_status || "").toLowerCase() === "pending")
      .sort((left, right) => Number(right.paid_at || right.updated_at || right.created_at || 0) - Number(left.paid_at || left.updated_at || left.created_at || 0)),
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

  const openConversation = (contactId: string) => {
    if (!contactId) return;
    navigate("/atendimento");
    selectChat(contactId);
  };

  const completeScaCharge = async (chargeId: number) => {
    if (!chargeId || busyChargeId) return;
    setBusyChargeId(chargeId);
    try {
      const ok = await confirmPixScaDone(chargeId);
      if (ok) await refreshPixCharges({ status: "paid", sca_manual_status: "pending" });
    } finally {
      setBusyChargeId(0);
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
          <Input
            type="number"
            min={1}
            max={180}
            value={daysFilter}
            onChange={(event) => setDaysFilter(event.target.value)}
            className="w-28"
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
            <Badge variant={inactiveQueue.length > 0 ? "secondary" : "outline"}>{`Acima de ${Math.max(1, Number(daysFilter) || 5)} dias`}</Badge>
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
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => completeScaCharge(Number(charge.id))}
                    disabled={busyChargeId === Number(charge.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" /> {busyChargeId === Number(charge.id) ? "Confirmando..." : "Confirmar baixa SCA"}
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
          <CardDescription>Use para abordagem humanizada e reducao de cancelamentos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {inactiveQueue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aluno acima do limite informado.</p>
          ) : inactiveQueue.map((student) => {
            const waLink = buildWhatsappLink(student.phone, student.name);
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
                  {waLink ? (
                    <a href={waLink} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" className="gap-1">
                        <MessageSquare className="h-4 w-4" /> Chamar no WhatsApp
                      </Button>
                    </a>
                  ) : (
                    <Badge variant="outline">Sem telefone</Badge>
                  )}
                </div>
              </div>
            );
          })}
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
