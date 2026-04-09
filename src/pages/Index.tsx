import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Send, Bot, User, Search, MessageSquare } from "lucide-react";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai" | "operator";
  timestamp: string;
  senderName?: string;
}

interface Conversation {
  id: string;
  contactName: string;
  phone: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  autoReply: boolean;
  assignedTo?: string;
}

const mockConversations: Conversation[] = [
  { id: "1", contactName: "Maria Silva", phone: "+55 11 99999-1234", lastMessage: "Qual o horário de funcionamento?", timestamp: "14:32", unread: 2, autoReply: true, assignedTo: "João" },
  { id: "2", contactName: "Carlos Souza", phone: "+55 11 98888-5678", lastMessage: "Quero cancelar meu plano", timestamp: "13:15", unread: 0, autoReply: false, assignedTo: "Ana" },
  { id: "3", contactName: "Ana Oliveira", phone: "+55 11 97777-9012", lastMessage: "Obrigada!", timestamp: "12:00", unread: 1, autoReply: true },
  { id: "4", contactName: "Pedro Santos", phone: "+55 11 96666-3456", lastMessage: "Tem aula de spinning?", timestamp: "11:45", unread: 3, autoReply: true },
];

const mockMessages: Record<string, Message[]> = {
  "1": [
    { id: "m1", content: "Olá, boa tarde!", sender: "user", timestamp: "14:30", senderName: "Maria" },
    { id: "m2", content: "Qual o horário de funcionamento?", sender: "user", timestamp: "14:32", senderName: "Maria" },
    { id: "m3", content: "Olá Maria! 🏋️ A academia funciona de segunda a sexta das 6h às 22h, e aos sábados das 8h às 14h. Domingos e feriados estamos fechados.", sender: "ai", timestamp: "14:32", senderName: "IA Gemini" },
  ],
  "4": [
    { id: "m4", content: "Oi, tudo bem?", sender: "user", timestamp: "11:40", senderName: "Pedro" },
    { id: "m5", content: "Tem aula de spinning?", sender: "user", timestamp: "11:45", senderName: "Pedro" },
    { id: "m6", content: "Olá Pedro! Sim, temos aulas de spinning! 🚴 As aulas acontecem terça e quinta às 7h, 12h e 19h. Quer reservar um horário?", sender: "ai", timestamp: "11:45", senderName: "IA Gemini" },
  ],
};

export default function AtendimentoPage() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>("1");
  const [searchQuery, setSearchQuery] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [conversations, setConversations] = useState(mockConversations);

  const filteredConversations = conversations.filter(
    (c) =>
      c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  const currentMessages = selectedConversation ? mockMessages[selectedConversation] || [] : [];
  const currentConversation = conversations.find((c) => c.id === selectedConversation);

  const toggleAutoReply = (id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, autoReply: !c.autoReply } : c))
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
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
          {filteredConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setSelectedConversation(conv.id)}
              className={`p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                selectedConversation === conv.id ? "bg-accent/30" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{conv.contactName}</span>
                    {conv.autoReply && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary">
                        <Bot className="h-3 w-3 mr-0.5" /> IA
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                  {conv.assignedTo && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      <User className="h-3 w-3 inline mr-0.5" />
                      {conv.assignedTo}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 ml-2">
                  <span className="text-[10px] text-muted-foreground">{conv.timestamp}</span>
                  {conv.unread > 0 && (
                    <span className="bg-primary text-primary-foreground text-[10px] rounded-full h-5 w-5 flex items-center justify-center">
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation && currentConversation ? (
          <>
            {/* Chat Header */}
            <div className="h-14 border-b flex items-center justify-between px-4 bg-card">
              <div>
                <h3 className="font-medium text-sm">{currentConversation.contactName}</h3>
                <p className="text-xs text-muted-foreground">{currentConversation.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Resposta IA</span>
                <Switch
                  checked={currentConversation.autoReply}
                  onCheckedChange={() => toggleAutoReply(currentConversation.id)}
                />
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3 max-w-2xl mx-auto">
                {currentMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === "user" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg px-3 py-2 ${
                        msg.sender === "user"
                          ? "bg-muted"
                          : msg.sender === "ai"
                          ? "bg-primary/10 border border-primary/20"
                          : "bg-secondary"
                      }`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        {msg.sender === "ai" && <Bot className="h-3 w-3 text-primary" />}
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {msg.senderName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
                      </div>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  </div>
                ))}
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
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                />
                <Button size="icon">
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
  );
}
