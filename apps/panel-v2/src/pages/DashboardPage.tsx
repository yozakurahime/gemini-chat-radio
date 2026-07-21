import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  MessageCircleMore,
  MessageSquareWarning,
  RefreshCcw,
  Server,
  ShieldAlert,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePanelData } from "@/hooks/use-panel-data";

const number = (value: unknown) => Math.max(0, Number(value || 0));
const toneClasses = {
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
} as const;

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    chats,
    opsDailySummary,
    refreshOpsDailySummary,
    systemHealth,
    refreshSystemHealth,
  } = usePanelData();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshOpsDailySummary(), refreshSystemHealth()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urgentChats = useMemo(
    () => (chats || [])
      .filter((chat) => chat.needsHuman || chat.attentionActive || chat.slaStatus === "critico" || chat.slaStatus === "atrasando")
      .sort((a, b) => number(b.timestamp) - number(a.timestamp)),
    [chats],
  );

  const unreadMessages = useMemo(
    () => (chats || []).reduce((total, chat) => total + number(chat.unreadCount), 0),
    [chats],
  );

  const automationReplies = number(opsDailySummary?.automation?.repliesToday);
  const automationHandoffs = number(opsDailySummary?.automation?.handoffsToday);
  const handledByAutomation = automationReplies + automationHandoffs;
  const handoffRate = handledByAutomation > 0 ? Math.round((automationHandoffs / handledByAutomation) * 100) : 0;
  const activeConversations = number(opsDailySummary?.chat?.activeConversations) || (chats || []).length;
  const localAwaitingHuman = (chats || []).filter((chat) => chat.needsHuman).length;
  const awaitingHuman = Math.max(number(opsDailySummary?.chat?.awaitingHuman), localAwaitingHuman);
  const humanOwned = number(opsDailySummary?.chat?.humanOwned);
  const generatedAt = number(opsDailySummary?.generatedAt);

  const metrics = [
    {
      label: "Aguardando atendente",
      value: awaitingHuman,
      detail: `${unreadMessages} mensagens não lidas`,
      icon: MessageSquareWarning,
      color: "rose",
    },
    {
      label: "Com atendimento humano",
      value: humanOwned,
      detail: "IA pausada até liberação manual",
      icon: UserRoundCheck,
      color: "amber",
    },
    {
      label: "Respostas da IA hoje",
      value: automationReplies,
      detail: `${number(opsDailySummary?.automation?.intentsToday)} intenções identificadas`,
      icon: Bot,
      color: "indigo",
    },
    {
      label: "Transferências hoje",
      value: automationHandoffs,
      detail: `${handoffRate}% da automação, incluindo confirmações`,
      icon: UsersRound,
      color: "violet",
    },
    {
      label: "Pix pagos hoje",
      value: number(opsDailySummary?.pix?.paidToday),
      detail: `${number(opsDailySummary?.pix?.generatedToday)} cobranças geradas`,
      icon: CreditCard,
      color: "emerald",
    },
    {
      label: "Aulas solicitadas hoje",
      value: number(opsDailySummary?.automation?.trialRequestsToday),
      detail: `${number(opsDailySummary?.pix?.pendingSca)} baixas Pix pendentes`,
      icon: Sparkles,
      color: "sky",
    },
  ] as const;

  const healthStatus = systemHealth?.status || "degraded";
  const healthLabel = healthStatus === "ok" ? "Sistema estável" : healthStatus === "critical" ? "Falha crítica" : "Atenção necessária";

  return (
    <div className="min-h-screen space-y-6 bg-neutral-50/60 p-4 dark:bg-neutral-950/60 sm:p-6">
      <section className="relative overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-950/10 sm:p-8">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <Badge className="mb-4 border-white/20 bg-white/15 text-white hover:bg-white/20">
              <Activity className="mr-1.5 h-3.5 w-3.5" /> Operação em tempo real
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Dashboard de atendimento</h1>
            <p className="mt-2 text-sm text-indigo-100 sm:text-base">
              Acompanhe a fila humana, o desempenho da IA e os resultados do dia com dados reais do sistema.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-white/90">
              <span className="rounded-full bg-black/15 px-3 py-1.5">{activeConversations} conversas ativas</span>
              <span className="rounded-full bg-black/15 px-3 py-1.5">{humanOwned} sob cuidado humano</span>
              <span className="rounded-full bg-black/15 px-3 py-1.5">{handoffRate}% de transferência hoje</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            {generatedAt > 0 && (
              <span className="text-xs text-indigo-100">
                Atualizado às {new Date(generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button className="rounded-full bg-white text-indigo-700 hover:bg-indigo-50" onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCcw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Atualizando" : "Atualizar dados"}
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(({ label, value, detail, icon: Icon, color }) => (
          <Card key={label} className="overflow-hidden border-neutral-200/80 bg-white/90 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/90">
            <CardContent className="flex items-start gap-4 p-5">
              <div className={`rounded-2xl p-3 ${toneClasses[color]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-neutral-950 dark:text-white">{value}</p>
                <p className="mt-1 truncate text-xs text-neutral-500">{detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card className="border-neutral-200/80 dark:border-neutral-800">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><MessageCircleMore className="h-5 w-5 text-rose-500" />Fila prioritária</CardTitle>
              <CardDescription>Conversas que precisam de atenção agora.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/atendimento")}>Abrir fila <ArrowRight className="ml-1 h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {urgentChats.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-5 w-5" /> Nenhuma conversa urgente neste momento.
              </div>
            ) : urgentChats.slice(0, 5).map((chat) => (
              <button key={chat.id} onClick={() => navigate("/atendimento")} className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 p-3 text-left transition hover:border-rose-200 hover:bg-rose-50/60 dark:border-neutral-800 dark:hover:border-rose-900 dark:hover:bg-rose-950/20">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  {(chat.name || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{chat.name || chat.id}</p>
                    {number(chat.unreadCount) > 0 && <Badge variant="destructive">{number(chat.unreadCount)}</Badge>}
                  </div>
                  <p className="truncate text-xs text-neutral-500">{chat.lastMessage || "Aguardando atendimento"}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-neutral-200/80 dark:border-neutral-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Server className="h-5 w-5 text-indigo-500" />Saúde do sistema</CardTitle>
            <CardDescription>Estado dos serviços que mantêm a operação funcionando.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-center justify-between rounded-2xl p-4 ${healthStatus === "ok" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" : healthStatus === "critical" ? "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300" : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"}`}>
              <div className="flex items-center gap-2 font-semibold">
                {healthStatus === "ok" ? <CheckCircle2 className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
                {healthLabel}
              </div>
              <Badge variant="outline" className="border-current">{healthStatus}</Badge>
            </div>
            <div className="space-y-2">
              {Object.entries(systemHealth?.components || {}).slice(0, 6).map(([key, component]) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium capitalize">{key.replace(/[_-]/g, " ")}</p>
                    <p className="truncate text-xs text-neutral-500">{String(component?.message || "Operando normalmente")}</p>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${component?.status === "critical" ? "bg-rose-500" : component?.status === "degraded" ? "bg-amber-500" : "bg-emerald-500"}`} />
                </div>
              ))}
              {!systemHealth?.components && (
                <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-neutral-500"><Clock3 className="h-4 w-4" />Diagnóstico ainda não carregado.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
