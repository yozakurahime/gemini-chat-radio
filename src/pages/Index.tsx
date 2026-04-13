import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Send, Bot, User, Search, MessageSquare, Loader2 } from "lucide-react";
import WhatsAppConnect from "@/components/whatsapp/WhatsAppConnect";
import {
  useConversations,
  useMessages,
  useSendMessage,
  useToggleAutoReply,
  useMarkAsRead,
} from "@/hooks/useWhatsAppData";

export default function AtendimentoPage() {
  const { data: conversations = [], isLoading: convLoading } = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");

  const { data: messages = [], isLoading: msgLoading } = useMessages(selectedId);
  const sendMsg = useSendMessage();
  const toggleAR = useToggleAutoReply();
  const markRead = useMarkAsRead();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const filtered = conversations.filter(
    (c) =>
      (c.contact_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone_number.includes(searchQuery)
  );

  const currentConversation = conversations.find((c) => c.id === selectedId);

  const selectConversation = (id: string) => {
    setSelectedId(id);
    const conv = conversations.find((c) => c.id === id);
    if (conv && conv.unread_count > 0) {
      markRead.mutate(id);
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!messageInput.trim() || !selectedId) return;
    sendMsg.mutate({ conversationId: selectedId, content: messageInput });
    setMessageInput("");
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* WhatsApp Connection Card */}
      <div className="p-4 border-b">
        <WhatsAppConnect />
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Conversations List */}
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
            {convLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {searchQuery ? "Nenhuma conversa encontrada" : "Nenhuma conversa ainda"}
              </div>
            ) : (
              filtered.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className={`p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedId === conv.id ? "bg-accent/30" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {conv.contact_name || conv.phone_number}
                        </span>
                        {conv.auto_reply_enabled && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary">
                            <Bot className="h-3 w-3 mr-0.5" /> IA
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {conv.last_message || "Sem mensagens"}
                      </p>
                      {conv.assigned_to && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          <User className="h-3 w-3 inline mr-0.5" />
                          {conv.assigned_to}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-2">
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(conv.last_message_at)}
                      </span>
                      {conv.unread_count > 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] rounded-full h-5 w-5 flex items-center justify-center">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedId && currentConversation ? (
            <>
              {/* Chat Header */}
              <div className="h-14 border-b flex items-center justify-between px-4 bg-card">
                <div>
                  <h3 className="font-medium text-sm">
                    {currentConversation.contact_name || currentConversation.phone_number}
                  </h3>
                  <p className="text-xs text-muted-foreground">{currentConversation.phone_number}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Resposta IA</span>
                  <Switch
                    checked={currentConversation.auto_reply_enabled}
                    onCheckedChange={(checked) =>
                      toggleAR.mutate({ id: currentConversation.id, enabled: checked })
                    }
                  />
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3 max-w-2xl mx-auto">
                  {msgLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground p-8">
                      Nenhuma mensagem ainda
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isIncoming = msg.sender !== "operator" && !msg.is_ai_response;
                      const isAI = msg.is_ai_response;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isIncoming ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg px-3 py-2 ${
                              isIncoming
                                ? "bg-muted"
                                : isAI
                                ? "bg-primary/10 border border-primary/20"
                                : "bg-secondary"
                            }`}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              {isAI && <Bot className="h-3 w-3 text-primary" />}
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {isIncoming ? (currentConversation.contact_name || "Cliente") : isAI ? "IA" : "Operador"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatTime(msg.created_at)}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="border-t p-3 bg-card">
                <div className="flex gap-2 max-w-2xl mx-auto">
                  <Input
                    placeholder="Digite uma mensagem..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <Button size="icon" onClick={handleSend} disabled={sendMsg.isPending || !messageInput.trim()}>
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
