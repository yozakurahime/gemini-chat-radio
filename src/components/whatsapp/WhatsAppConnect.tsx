import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone, Wifi, WifiOff, RefreshCw, QrCode, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WhatsAppSession {
  id: string;
  session_name: string;
  status: string;
  qr_code: string | null;
  phone_number: string | null;
  connected_at: string | null;
}

export default function WhatsAppConnect() {
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  const fetchSession = async () => {
    const { data } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("session_name", "default")
      .maybeSingle();
    setSession(data as WhatsAppSession | null);
    setLoading(false);
  };

  useEffect(() => {
    fetchSession();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("whatsapp-session")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_sessions", filter: "session_name=eq.default" },
        (payload) => {
          setSession(payload.new as WhatsAppSession);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const initSession = async () => {
    setLoading(true);
    const { data: existing } = await supabase
      .from("whatsapp_sessions")
      .select("id")
      .eq("session_name", "default")
      .maybeSingle();

    if (!existing) {
      await supabase.from("whatsapp_sessions").insert({
        session_name: "default",
        status: "disconnected",
      });
    }
    await fetchSession();
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    connected: { label: "Conectado", color: "bg-green-500", icon: <Wifi className="h-4 w-4" /> },
    qr_ready: { label: "QR Code Pronto", color: "bg-yellow-500", icon: <QrCode className="h-4 w-4" /> },
    connecting: { label: "Conectando...", color: "bg-blue-500", icon: <RefreshCw className="h-4 w-4 animate-spin" /> },
    disconnected: { label: "Desconectado", color: "bg-muted-foreground", icon: <WifiOff className="h-4 w-4" /> },
  };

  const currentStatus = statusConfig[session?.status ?? "disconnected"] ?? statusConfig.disconnected;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Conexão WhatsApp
          </div>
          <Badge variant="outline" className="gap-1.5">
            <span className={`h-2 w-2 rounded-full ${currentStatus.color}`} />
            {currentStatus.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* QR Code Display */}
        {session?.status === "qr_ready" && session.qr_code && (
          <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-lg border">
            <p className="text-sm font-medium text-foreground">Escaneie o QR Code no WhatsApp</p>
            <div className="bg-white p-4 rounded-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(session.qr_code)}`}
                alt="QR Code WhatsApp"
                className="w-64 h-64"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Abra o WhatsApp → Menu (⋯) → Aparelhos conectados → Conectar aparelho
            </p>
          </div>
        )}

        {/* Connected info */}
        {session?.status === "connected" && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <Wifi className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-medium text-sm">WhatsApp conectado</p>
              {session.phone_number && (
                <p className="text-xs text-muted-foreground">Número: {session.phone_number}</p>
              )}
              {session.connected_at && (
                <p className="text-xs text-muted-foreground">
                  Desde: {new Date(session.connected_at).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Disconnected / Init */}
        {(!session || session.status === "disconnected") && (
          <div className="text-center space-y-3 py-4">
            <WifiOff className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              WhatsApp não conectado. Inicie o serviço Baileys local e envie o QR code para o webhook.
            </p>
            <Button variant="outline" onClick={initSession} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Iniciar Sessão
            </Button>
          </div>
        )}

        {/* Webhook URL for local Baileys */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground">URL do Webhook (para o Baileys local)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted p-2 rounded font-mono truncate">
              {webhookUrl}
            </code>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copyWebhookUrl}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Configure seu servidor Baileys para enviar eventos (qr, connected, disconnected, message) para esta URL.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
