import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Send, Bot, User, Search, MessageSquare, Image as ImageIcon, AlertTriangle, Loader2 } from "lucide-react";
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
    <div className={`flex ${fromUser ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[78%] rounded-lg px-3 py-2 shadow-sm ${
          isSticker
            ? "bg-transparent shadow-none px-0"
            : fromUser
              ? "bg-muted"
              : fromAi
                ? "bg-primary/10 border border-primary/20"
                : "bg-secondary"
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
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="p-4 border-b">
        <WhatsAppConnect />
        {opsDailySummary ? (
          <div className="mt-3 rounded-lg border bg-card/70 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">Conversas ativas: {Number(opsDailySummary.chat?.activeConversations || 0)}</Badge>
              <Badge variant={Number(opsDailySummary.chat?.attentionActive || 0) > 0 ? "secondary" : "outline"}>
                Em atencao: {Number(opsDailySummary.chat?.attentionActive || 0)}
              </Badge>
              
              <Badge variant="outline">Pagos hoje: {Number(opsDailySummary.pix?.paidToday || 0)}</Badge>
              <Badge variant="outline">IA hoje: {Number(opsDailySummary.automation?.repliesToday || 0)}</Badge>
              <Badge variant="outline">Transferencias: {Number(opsDailySummary.automation?.handoffsToday || 0)}</Badge>
              <Badge variant="outline">Aulas solicitadas: {Number(opsDailySummary.automation?.trialRequestsToday || 0)}</Badge>
              <Badge variant="outline">Inativos (+5d): {Number(opsDailySummary.retention?.inactiveStudents5d || 0)}</Badge>
              <Badge
                variant={Number(opsDailySummary.webhook?.consecutiveFailures || 0) > 0 ? "destructive" : "default"}
              >
                Webhook Pix: {Number(opsDailySummary.webhook?.consecutiveFailures || 0) > 0 ? "com falhas" : "ok"}
              </Badge>
              <span className="text-muted-foreground">Atualizado: {formatTime(opsDailySummary.generatedAt)}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-80 border-r flex flex-col bg-card">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant={chatFilter === "urgent" ? "default" : "outline"} className="h-7 text-[11px] px-2" onClick={() => setChatFilter("urgent")}>Urgentes</Button>
              <Button size="sm" variant={chatFilter === "unread" ? "default" : "outline"} className="h-7 text-[11px] px-2" onClick={() => setChatFilter("unread")}>Nao lidas</Button>
              <Button size="sm" variant={chatFilter === "all" ? "default" : "outline"} className="h-7 text-[11px] px-2" onClick={() => setChatFilter("all")}>Todos</Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filteredConversations.map((conv) => {
              const slaCritical = conv.slaStatus === "critico";
              const slaDelayed = conv.slaStatus === "atrasando";
              const urgentVisual = slaCritical || !!conv.attentionActive;
              return (
                <div
                  key={conv.id}
                  onClick={() => selectChat(conv.id)}
                  className={`relative p-3 border-b cursor-pointer transition-colors ${
                    slaCritical
                      ? "bg-red-100/90 border-l-4 border-l-red-600 ring-1 ring-red-300/80 hover:bg-red-100 dark:bg-red-500/15 dark:border-l-red-300 dark:ring-red-400/50 motion-safe:animate-pulse motion-reduce:animate-none"
                      : conv.attentionActive
                        ? "bg-amber-100/80 border-l-4 border-l-amber-500 ring-1 ring-amber-300/80 hover:bg-amber-100 dark:bg-amber-500/10 dark:border-l-amber-300 dark:ring-amber-400/40 motion-safe:animate-pulse motion-reduce:animate-none"
                        : slaDelayed
                          ? "bg-orange-100/80 border-l-4 border-l-orange-500 ring-1 ring-orange-300/70 hover:bg-orange-100 dark:bg-orange-500/10 dark:border-l-orange-300"
                          : "hover:bg-muted/50"
                  } ${selectedChatId === conv.id ? "bg-accent/30" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm truncate ${(urgentVisual || slaDelayed) ? "font-semibold" : ""}`}>
                          {conv.attentionActive ? `NOVA • ${conv.name || phoneFromJid(conv.id)}` : (conv.name || phoneFromJid(conv.id))}
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
                            ? "bg-amber-500 text-white text-[11px] h-6 min-w-6 px-1.5 shadow-sm ring-2 ring-amber-300/80 motion-safe:animate-pulse motion-reduce:animate-none"
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

        <div className="flex-1 flex flex-col">
          {selectedChat ? (
            <>
              <div className="h-14 border-b flex items-center justify-between px-4 bg-card">
                <div>
                  <h3 className="font-medium text-sm">{selectedChat.name || phoneFromJid(selectedChat.id)}</h3>
                  <p className="text-xs text-muted-foreground">{phoneFromJid(selectedChat.id)}</p>
                </div>
                <div className="flex items-center gap-2">
                                    {selectedChat.slaStatus === "critico" ? <Badge variant="destructive">SLA Critico</Badge> : null}
                  {selectedChat.slaStatus === "atrasando" ? <Badge variant="secondary">SLA Atrasando</Badge> : null}
                  <span className="text-xs text-muted-foreground">Resposta IA</span>
                  <Switch
                    checked={!selectedChat.pausedByHuman}
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

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3 max-w-2xl mx-auto">
                  <div className="rounded-lg border bg-card/70 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Transparencia da IA</p>
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

              <div className="border-t p-3 bg-card">
                <div className="flex gap-2 max-w-2xl mx-auto">
                  <Input
                    placeholder="Digite uma mensagem..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                  />
                  <Button size="icon" onClick={submit} disabled={!messageInput.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>Selecione uma conversa</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
