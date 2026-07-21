import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Send, Bot, User, Search, MessageSquare, Image as ImageIcon, AlertTriangle, Loader2, ArrowLeft, Inbox, Sparkles, Users, CircleAlert } from "lucide-react";
import { parsePanelMessage, usePanelData } from "@/hooks/use-panel-data";
import WhatsAppConnect from "@/components/whatsapp/WhatsAppConnect";
import { formatDateTimeBr, formatTimeBr } from "@/lib/date-time";
import { toast } from "sonner";

function formatTime(value?: number) {
  return formatTimeBr(value, "");
}

function formatDateTime(value?: number) {
  return formatDateTimeBr(value, "-");
}

function formatCurrency(cents?: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function phoneFromJid(id: string) {
  const digits = String(id || "").replace(/\D/g, "");
  if (!digits) return id;
  if (digits.length <= 11) return digits;
  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`;
}

type RenderMessage = ReturnType<typeof parsePanelMessage>;

function ChatMediaBubble({ message }: { message: RenderMessage }) {
  if (!message.media?.url || !message.mediaKind) return null;

  const isSticker = message.mediaKind === "sticker";
  const label = isSticker ? "Figurinha" : "Imagem";

  return (
    <div className={isSticker ? "space-y-1" : "space-y-2"}>
      <a
        href={message.media.url}
        target="_blank"
        rel="noreferrer"
        className={isSticker ? "block" : "block overflow-hidden rounded-md border bg-background/60"}
        title={`Abrir ${label.toLowerCase()}`}
      >
        <img
          src={message.media.url}
          alt={message.content || label}
          loading="lazy"
          className={
            isSticker
              ? "h-32 w-32 object-contain drop-shadow-sm"
              : "max-h-80 w-full max-w-sm object-contain"
          }
        />
      </a>
      {!isSticker && message.content ? (
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      ) : null}
      {!message.content && !isSticker ? (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ImageIcon className="h-3 w-3" />
          <span>Imagem</span>
        </div>
      ) : null}
    </div>
  );
}

function ChatMessageBubble({ message }: { message: RenderMessage }) {
  const fromUser = message.sender === "user";
  const fromAi = message.sender === "ai";
  const isSticker = message.mediaKind === "sticker";

  return (
    <div className={`flex ${fromUser ? "justify-start" : "justify-end"} motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300`}>
      <div
        className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 shadow-[0_8px_24px_-18px_rgba(15,64,46,0.55)] sm:max-w-[75%] ${
          isSticker
            ? "bg-transparent shadow-none px-0"
            : fromUser
              ? "rounded-tl-md border border-border/60 bg-white/90 dark:bg-muted"
              : fromAi
                ? "rounded-tr-md border border-primary/15 bg-emerald-50/90 dark:bg-primary/10"
                : "rounded-tr-md bg-foreground text-background"
        }`}
      >
        <div className="flex items-center gap-1 mb-1">
          {fromAi && <Bot className="h-3 w-3 text-primary" />}
          <span className="text-[10px] font-medium text-muted-foreground">
            {message.senderName}
          </span>
          {message.mediaKind ? (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {message.mediaKind === "sticker" ? "figurinha" : "imagem"}
            </Badge>
          ) : null}
        </div>
        {message.mediaKind ? (
          <ChatMediaBubble message={message} />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        )}
        {message.timestamp ? (
          <div className="mt-1 flex justify-end">
            <span className="text-[10px] text-muted-foreground">{message.timestamp}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AtendimentoPage() {
  const panelData = usePanelData();
  const {
    chats,
    selectedChatId,
    selectedChat,
    messages,
    selectChat,
    sendText,
    setChatIAEnabled,
    updateAutomationProfile,
    updateTrialRequest,
    fetchAiContextPreview,
    submitAiFeedback,
    opsDailySummary,
    refreshOpsDailySummary: rawRefreshOpsDailySummary,
    hasMoreMessages,
    loadingMessages,
    loadMoreMessages,
  } = panelData;
  const refreshOpsDailySummary = rawRefreshOpsDailySummary || (async () => null);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatFilter, setChatFilter] = useState<"urgent" | "unread" | "all">("urgent");
  const [messageInput, setMessageInput] = useState("");
  const [iaSwitchLoading, setIaSwitchLoading] = useState(false);
  const [aiPreview, setAiPreview] = useState<any>(null);
  const [aiPreviewLoading, setAiPreviewLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [mobileListVisible, setMobileListVisible] = useState(false);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = chats.filter((chat) => {
      if (chat.status === "archived") return false;
      const isUrgent = !!chat.needsHuman || chat.slaStatus === "atrasando" || chat.slaStatus === "critico";
      const hasUnread = Number(chat.unreadCount || 0) > 0;
      if (chatFilter === "urgent" && !isUrgent) return false;
      if (chatFilter === "unread" && !hasUnread) return false;
      if (!query) return true;
      return `${chat.name || ""} ${chat.id || ""} ${chat.lastMessage || ""}`.toLowerCase().includes(query);
    });

    return filtered.sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0));
  }, [chatFilter, chats, searchQuery]);

  const queueCounts = useMemo(() => ({
    urgent: chats.filter((chat) => chat.status !== "archived" && (!!chat.needsHuman || chat.slaStatus === "atrasando" || chat.slaStatus === "critico")).length,
    unread: chats.filter((chat) => chat.status !== "archived" && Number(chat.unreadCount || 0) > 0).length,
    all: chats.filter((chat) => chat.status !== "archived").length,
  }), [chats]);

  const currentMessages = useMemo(
    () => messages.map((message, index) => ({ ...parsePanelMessage(message), id: `${index}-${message}` })),
    [messages],
  );
  const selectedMemory = selectedChat?.customerMemory || aiPreview?.automation?.memory || {};
  const selectedTrialRequest = selectedChat?.trialRequest || aiPreview?.automation?.trialRequest || null;

  const submit = async () => {
    const text = messageInput.trim();
    if (!text) return;
    const ok = await sendText(text);
    if (ok) setMessageInput("");
  };

  useEffect(() => {
    void refreshOpsDailySummary();
    const timer = window.setInterval(() => {
      void refreshOpsDailySummary();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [refreshOpsDailySummary]);

  useEffect(() => {
    let active = true;
    if (!selectedChatId) {
      setAiPreview(null);
      return;
    }
    setAiPreviewLoading(true);
    fetchAiContextPreview(selectedChatId)
      .then((preview) => {
        if (!active) return;
        setAiPreview(preview);
      })
      .finally(() => {
        if (active) setAiPreviewLoading(false);
      });
    return () => { active = false; };
  }, [fetchAiContextPreview, selectedChatId]);

  const sendAiFeedback = async (feedbackType: string, reason: string) => {
    if (!selectedChatId || feedbackLoading) return;
    setFeedbackLoading(true);
    try {
      const ok = await submitAiFeedback(selectedChatId, {
        feedbackType,
        reason,
      });
      if (ok) {
        setAiPreview(await fetchAiContextPreview(selectedChatId));
      }
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-3 overflow-hidden p-3 sm:p-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_10px_25px_-12px_hsl(var(--primary))]">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Central de atendimento</h2>
              <p className="text-xs text-muted-foreground">Priorize, responda e acompanhe cada conversa.</p>
            </div>
          </div>
        </div>
        <WhatsAppConnect />
      </div>
      <div className="shrink-0">
        {opsDailySummary ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
            {[
              { label: "Ativas", value: Number(opsDailySummary.chat?.activeConversations || 0), icon: Users },
              { label: "Em atenção", value: Number(opsDailySummary.chat?.attentionActive || 0), icon: CircleAlert, alert: Number(opsDailySummary.chat?.attentionActive || 0) > 0 },
              { label: "Respostas da IA", value: Number(opsDailySummary.automation?.repliesToday || 0), icon: Sparkles },
              { label: "Transferências", value: Number(opsDailySummary.automation?.handoffsToday || 0), icon: User },
              { label: "Aulas solicitadas", value: Number(opsDailySummary.automation?.trialRequestsToday || 0), icon: Inbox },
              { label: "Pagamentos hoje", value: Number(opsDailySummary.pix?.paidToday || 0), icon: MessageSquare },
            ].map((metric) => (
              <div key={metric.label} className={`panel-soft flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2 ${metric.alert ? "border-amber-300/70 bg-amber-50/80 dark:bg-amber-500/10" : ""}`}>
                <metric.icon className={`h-4 w-4 shrink-0 ${metric.alert ? "text-amber-600" : "text-primary"}`} />
                <div className="min-w-0 leading-tight">
                  <p className="text-base font-bold tabular-nums">{metric.value}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{metric.label}</p>
                </div>
              </div>
            ))}
            <span className="sr-only">Atualizado: {formatTime(opsDailySummary.generatedAt)}</span>
            {Number(opsDailySummary.webhook?.consecutiveFailures || 0) > 0 ? (
              <Badge variant="destructive" className="absolute right-4 top-4">Falha no webhook Pix</Badge>
            ) : null}
          </div>
        ) : (
          <div className="h-[52px] rounded-2xl border border-dashed border-border/70 bg-card/40" />
        )}
      </div>

      <div className="panel-glass flex min-h-0 flex-1 overflow-hidden rounded-3xl">
        <div className={`${mobileListVisible || !selectedChat ? "flex" : "hidden md:flex"} w-full flex-col border-r border-border/60 bg-card/45 md:w-80 lg:w-[22rem]`}>
          <div className="border-b border-border/60 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou mensagem"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 rounded-xl border-border/60 bg-background/70 pl-9 shadow-none focus-visible:ring-2"
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-muted/70 p-1">
              <Button aria-label="Urgentes" size="sm" variant="ghost" className={`h-8 rounded-lg px-2 text-[11px] ${chatFilter === "urgent" ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground"}`} onClick={() => setChatFilter("urgent")}>Urgentes <span className="ml-1 opacity-60">{queueCounts.urgent}</span></Button>
              <Button aria-label="Nao lidas" size="sm" variant="ghost" className={`h-8 rounded-lg px-2 text-[11px] ${chatFilter === "unread" ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground"}`} onClick={() => setChatFilter("unread")}>Não lidas <span className="ml-1 opacity-60">{queueCounts.unread}</span></Button>
              <Button aria-label="Todos" size="sm" variant="ghost" className={`h-8 rounded-lg px-2 text-[11px] ${chatFilter === "all" ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground"}`} onClick={() => setChatFilter("all")}>Todos <span className="ml-1 opacity-60">{queueCounts.all}</span></Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filteredConversations.length === 0 ? (
              <div className="grid min-h-52 place-items-center px-6 text-center">
                <div>
                  <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
                    <Inbox className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium">Nenhuma conversa aqui</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tente outro filtro ou uma nova busca.</p>
                </div>
              </div>
            ) : null}
            {filteredConversations.map((conv) => {
              const slaCritical = conv.slaStatus === "critico";
              const slaDelayed = conv.slaStatus === "atrasando";
              const urgentVisual = slaCritical || !!conv.attentionActive;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    setMobileListVisible(false);
                    selectChat(conv.id);
                  }}
                  className={`relative mx-2 mt-2 cursor-pointer rounded-2xl border p-3 transition-all duration-300 ${
                    slaCritical
                      ? "border-rose-300/80 bg-rose-50/90 hover:bg-rose-100/90 dark:border-rose-500/30 dark:bg-rose-500/10"
                      : conv.attentionActive
                        ? "border-amber-300/70 bg-amber-50/90 hover:bg-amber-100/80 dark:border-amber-500/30 dark:bg-amber-500/10"
                        : slaDelayed
                          ? "border-orange-300/70 bg-orange-50/80 hover:bg-orange-100/80 dark:border-orange-500/30 dark:bg-orange-500/10"
                          : "border-transparent bg-card/35 hover:-translate-y-0.5 hover:border-border/80 hover:bg-card hover:shadow-sm"
                  } ${selectedChatId === conv.id ? "border-primary/40 bg-accent/70 ring-2 ring-primary/10" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${urgentVisual ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary"}`}>
                      {String(conv.name || phoneFromJid(conv.id)).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm truncate ${(urgentVisual || slaDelayed) ? "font-semibold" : ""}`}>
                          {conv.name || phoneFromJid(conv.id)}
                        </span>
                        {slaCritical ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0">SLA Critico</Badge> : null}
                                                {!slaCritical && slaDelayed ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-orange-500/20 text-orange-700 dark:text-orange-200">SLA Atrasando</Badge>
                        ) : null}
                        {!conv.pausedByHuman && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary">
                            <Bot className="h-3 w-3 mr-0.5" /> IA
                          </Badge>
                        )}
                        {conv.needsHuman ? <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Humano</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage || "Sem mensagens recentes"}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {conv.pausedByHuman ? (
                          <p className="text-[10px] text-muted-foreground">
                            <User className="h-3 w-3 inline mr-0.5" />
                            Atendimento humano
                          </p>
                        ) : null}
                        {Number(conv.slaPendingSince || 0) > 0 ? (
                          <p className="text-[10px] text-muted-foreground">Pendente desde {formatTime(conv.slaPendingSince)}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-2">
                      <span className="text-[10px] text-muted-foreground">{formatTime(conv.timestamp)}</span>
                      {(conv.unreadCount || 0) > 0 ? (
                        <span className={`rounded-full flex items-center justify-center font-semibold ${
                          urgentVisual
                            ? "bg-amber-500 text-white text-[11px] h-6 min-w-6 px-1.5 shadow-sm ring-2 ring-amber-300/40"
                            : "bg-primary text-primary-foreground text-[10px] h-5 min-w-5 px-1"
                        }`}>
                          {conv.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </ScrollArea>
        </div>

        <div className={`${mobileListVisible ? "hidden md:flex" : selectedChat ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {selectedChat ? (
            <>
              <div className="flex min-h-16 items-center justify-between gap-3 border-b border-border/60 bg-card/65 px-3 backdrop-blur-md sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-xl md:hidden" onClick={() => setMobileListVisible(true)} title="Voltar para conversas">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                    {String(selectedChat.name || phoneFromJid(selectedChat.id)).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{selectedChat.name || phoneFromJid(selectedChat.id)}</h3>
                    <p className="truncate text-[11px] text-muted-foreground">{phoneFromJid(selectedChat.id)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="hidden lg:flex">
                    {selectedChat.slaStatus === "critico" ? <Badge variant="destructive">SLA crítico</Badge> : null}
                    {selectedChat.slaStatus === "atrasando" ? <Badge variant="secondary">SLA atrasando</Badge> : null}
                  </div>
                  <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${selectedChat.pausedByHuman ? "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" : "border-border/60 bg-background/70"}`}>
                    {selectedChat.pausedByHuman ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
                    <span className="hidden text-[11px] font-medium sm:inline">
                      {selectedChat.pausedByHuman ? "Atendimento humano" : "IA ativa"}
                    </span>
                    <Switch
                      checked={!selectedChat.pausedByHuman}
                      aria-label={selectedChat.pausedByHuman ? "Reativar IA nesta conversa" : "Pausar IA nesta conversa"}
                      disabled={iaSwitchLoading}
                      onCheckedChange={async (checked) => {
                        setIaSwitchLoading(true);
                        try {
                          await setChatIAEnabled(checked);
                        } finally {
                          setIaSwitchLoading(false);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <ScrollArea className="subtle-grid flex-1 bg-muted/20 p-3 sm:p-5">
                <div className="mx-auto max-w-3xl space-y-3 pb-3">
                  <div className="panel-soft space-y-2 rounded-2xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Contexto da Hime</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void sendAiFeedback("correta", "Resposta validada pelo atendente.")} disabled={feedbackLoading || aiPreviewLoading}>Correta</Button>
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void sendAiFeedback("inadequada", "Resposta inadequada marcada pelo atendente.")} disabled={feedbackLoading || aiPreviewLoading}>Inadequada</Button>
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void sendAiFeedback("desatualizada", "Informacao desatualizada marcada pelo atendente.")} disabled={feedbackLoading || aiPreviewLoading}>Desatualizada</Button>
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void sendAiFeedback("deveria_transferir", "A IA deveria ter chamado um atendente.")} disabled={feedbackLoading || aiPreviewLoading}>
                          {feedbackLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Chamar humano"}
                        </Button>
                      </div>
                    </div>
                    {aiPreviewLoading ? (
                      <p className="text-xs text-muted-foreground">Carregando contexto...</p>
                    ) : aiPreview ? (
                      <>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          <Badge variant="secondary">Confianca: {String(aiPreview?.confidence || "-")}</Badge>
                          <Badge variant="outline">Base: {Number(aiPreview?.context?.baseContextLength || 0)} chars</Badge>
                          <Badge variant="outline">Avisos: {Number(aiPreview?.context?.noticesLength || 0)} chars</Badge>
                          <Badge variant="outline">Intencao: {String(aiPreview?.automation?.intent || selectedChat.lastIntent || "unknown")}</Badge>
                          <Badge variant="outline">Etapa: {String(aiPreview?.automation?.salesStage || selectedChat.salesStage || "new")}</Badge>
                        </div>
                        {Object.keys(selectedMemory).length > 0 ? (
                          <div className="rounded-md bg-muted/50 p-2 text-[11px] space-y-1">
                            <p className="font-medium">Memoria do cliente</p>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedMemory.objective ? <Badge variant="outline">Objetivo: {selectedMemory.objective}</Badge> : null}
                              {selectedMemory.modality ? <Badge variant="outline">Modalidade: {selectedMemory.modality}</Badge> : null}
                              {selectedMemory.planInterest ? <Badge variant="outline">Plano: {selectedMemory.planInterest}</Badge> : null}
                              {selectedMemory.preferredDay ? <Badge variant="outline">Dia: {selectedMemory.preferredDay}</Badge> : null}
                              {selectedMemory.preferredTime ? <Badge variant="outline">Horario: {selectedMemory.preferredTime}</Badge> : null}
                            </div>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between rounded-md border p-2">
                          <div>
                            <p className="text-[11px] font-medium">Mensagens proativas autorizadas</p>
                            <p className="text-[10px] text-muted-foreground">Necessario para campanhas e reativacoes.</p>
                          </div>
                          <Switch
                            checked={!!selectedChat.marketingOptIn && !selectedChat.globalOptOut}
                            onCheckedChange={(checked) => void updateAutomationProfile({ marketingOptIn: checked })}
                          />
                        </div>
                        {selectedTrialRequest?.status === "pending_confirmation" ? (
                          <div className="rounded-md border border-amber-300 bg-amber-50/60 p-2 dark:bg-amber-500/10">
                            <p className="text-[11px] font-medium">Confirmar aula experimental</p>
                            <p className="text-[10px] text-muted-foreground">
                              {selectedTrialRequest.requested_day} as {selectedTrialRequest.requested_time}
                              {selectedTrialRequest.modality ? ` - ${selectedTrialRequest.modality}` : ""}
                            </p>
                            <div className="mt-2 flex gap-2">
                              <Button size="sm" className="h-7 text-[11px]" onClick={() => void updateTrialRequest("confirmed")}>Confirmar</Button>
                              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void updateTrialRequest("cancelled")}>Cancelar</Button>
                            </div>
                          </div>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground">Atualizado em {formatDateTime(aiPreview?.generatedAt)}</p>
                        {Array.isArray(aiPreview?.warnings) && aiPreview.warnings.length > 0 ? (
                          <div className="space-y-1">
                            {aiPreview.warnings.map((warning: string) => (
                              <p key={warning} className="text-[11px] text-amber-600 dark:text-amber-300">- {warning}</p>
                            ))}
                          </div>
                        ) : null}
                        
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nao foi possivel carregar o preview de contexto para esta conversa.</p>
                    )}
                  </div>

                  {hasMoreMessages ? (
                    <div className="flex justify-center">
                      <Button variant="outline" size="sm" disabled={loadingMessages} onClick={loadMoreMessages}>
                        {loadingMessages ? "Carregando..." : "Carregar anteriores"}
                      </Button>
                    </div>
                  ) : null}
                  {currentMessages.map((msg) => <ChatMessageBubble key={msg.id} message={msg} />)}
                </div>
              </ScrollArea>

              <div className="border-t border-border/60 bg-card/70 p-3 backdrop-blur-md">
                <div className="mx-auto flex max-w-3xl gap-2 rounded-2xl border border-border/70 bg-background/80 p-1.5 shadow-[0_12px_30px_-22px_rgba(15,64,46,0.7)] focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
                  <Input
                    placeholder="Digite uma mensagem..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    className="h-10 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                  />
                  <Button size="icon" className="h-10 w-10 rounded-xl shadow-sm" onClick={submit} disabled={!messageInput.trim()} title="Enviar mensagem">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="subtle-grid flex flex-1 items-center justify-center text-muted-foreground">
              <div className="max-w-xs text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
                  <MessageSquare className="h-7 w-7" />
                </div>
                <p className="font-semibold text-foreground">Sua caixa de entrada</p>
                <p className="mt-1 text-sm">Selecione uma conversa para visualizar o histórico e responder.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
