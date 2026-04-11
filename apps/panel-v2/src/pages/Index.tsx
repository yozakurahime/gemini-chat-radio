import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Send, Bot, User, Search, MessageSquare, Image as ImageIcon } from "lucide-react";
import { parsePanelMessage, usePanelData } from "@/hooks/use-panel-data";
import WhatsAppConnect from "@/components/whatsapp/WhatsAppConnect";

function formatTime(value?: number) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
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
          <span className="text-[10px] text-muted-foreground">{message.timestamp}</span>
        </div>
        {message.mediaKind ? (
          <ChatMediaBubble message={message} />
        ) : (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        )}
      </div>
    </div>
  );
}

export default function AtendimentoPage() {
  const {
    chats,
    selectedChatId,
    selectedChat,
    messages,
    selectChat,
    sendText,
    hasMoreMessages,
    loadingMessages,
    loadMoreMessages,
  } = usePanelData();
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return chats.filter((chat) => {
      if (!query) return chat.status !== "archived";
      return `${chat.name || ""} ${chat.id || ""} ${chat.lastMessage || ""}`.toLowerCase().includes(query);
    });
  }, [chats, searchQuery]);

  const currentMessages = useMemo(
    () => messages.map((message, index) => ({ ...parsePanelMessage(message), id: `${index}-${message}` })),
    [messages],
  );

  const submit = async () => {
    const text = messageInput.trim();
    if (!text) return;
    const ok = await sendText(text);
    if (ok) setMessageInput("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="p-4 border-b">
        <WhatsAppConnect />
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
        </div>
        <ScrollArea className="flex-1">
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => selectChat(conv.id)}
              className={`p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                selectedChatId === conv.id ? "bg-accent/30" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{conv.name || phoneFromJid(conv.id)}</span>
                    {!conv.pausedByHuman && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary">
                        <Bot className="h-3 w-3 mr-0.5" /> IA
                      </Badge>
                    )}
                    {conv.needsHuman && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        Humano
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage || "Sem mensagens recentes"}</p>
                  {conv.pausedByHuman && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      <User className="h-3 w-3 inline mr-0.5" />
                      Atendimento humano
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 ml-2">
                  <span className="text-[10px] text-muted-foreground">{formatTime(conv.timestamp)}</span>
                  {(conv.unreadCount || 0) > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] rounded-full h-5 w-5 flex items-center justify-center">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
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
                <span className="text-xs text-muted-foreground">Resposta IA</span>
                <Switch checked={!selectedChat.pausedByHuman} disabled />
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3 max-w-2xl mx-auto">
                {hasMoreMessages && (
                  <div className="flex justify-center">
                    <Button variant="outline" size="sm" disabled={loadingMessages} onClick={loadMoreMessages}>
                      {loadingMessages ? "Carregando..." : "Carregar anteriores"}
                    </Button>
                  </div>
                )}
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
