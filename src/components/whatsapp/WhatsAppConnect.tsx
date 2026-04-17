import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Smartphone, Wifi, WifiOff, RefreshCw, QrCode, Copy, Check, AlertTriangle, Terminal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WhatsAppSession {
  id: string;
  session_name: string;
  status: string;
  qr_code: string | null;
  phone_number: string | null;
  connected_at: string | null;
  updated_at?: string;
}

const QR_STALE_SECONDS = 60; // QR do WhatsApp expira ~60s

export default function WhatsAppConnect() {
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

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
    const tick = window.setInterval(() => setNow(Date.now()), 5000);
    const channel = supabase
      .channel("whatsapp-session")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_sessions", filter: "session_name=eq.default" },
        (payload) => setSession(payload.new as WhatsAppSession)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); window.clearInterval(tick); };
  }, []);

  const initSession = async () => {
    setLoading(true);
    const { data: existing } = await supabase
      .from("whatsapp_sessions")
      .select("id")
      .eq("session_name", "default")
      .maybeSingle();

    if (!existing) {
      await supabase.from("whatsapp_sessions").insert({ session_name: "default", status: "disconnected" });
    } else {
      await supabase.from("whatsapp_sessions").update({ status: "disconnected", qr_code: null }).eq("id", existing.id);
    }
    await fetchSession();
    toast.info("Sessão reiniciada. Aguardando o servidor Baileys local enviar um novo QR.");
  };

  const copyValue = (value: string, key: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    toast.success("Copiado!");
    setTimeout(() => setCopied(null), 2000);
  };

  // Determine QR freshness
  const qrAgeSec = session?.updated_at
    ? Math.floor((now - new Date(session.updated_at).getTime()) / 1000)
    : 999;
  const qrStale = session?.status === "qr_ready" && qrAgeSec > QR_STALE_SECONDS;

  // Detect "server not running": session disconnected but never updated, or no session row
  const serverLikelyDown =
    !session ||
    (session.status === "disconnected" && !session.connected_at) ||
    qrStale;

  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    connected: { label: "Conectado", color: "bg-green-500", icon: <Wifi className="h-4 w-4" /> },
    qr_ready: { label: qrStale ? "QR expirado" : "QR Code pronto", color: qrStale ? "bg-destructive" : "bg-yellow-500", icon: <QrCode className="h-4 w-4" /> },
    connecting: { label: "Conectando…", color: "bg-blue-500", icon: <RefreshCw className="h-4 w-4 animate-spin" /> },
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
        {/* Diagnostic when server is down */}
        {serverLikelyDown && session?.status !== "connected" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Servidor Baileys local não está respondendo</AlertTitle>
            <AlertDescription className="space-y-2 text-xs">
              <p>
                O QR Code é gerado pelo servidor Node em <code className="font-mono">apps/server</code> rodando no PC da recepção.
                Se ele estiver parado, o QR fica inválido ou nunca aparece.
              </p>
              <p className="font-semibold pt-1">Para subir o servidor:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Dê um duplo clique em <code className="font-mono bg-background px-1 rounded">iniciar_sistema.bat</code> (na raiz do projeto).</li>
                <li>Aguarde a janela do Node abrir e mostrar <em>"Servidor pronto"</em>.</li>
                <li>Volte aqui — o QR aparece em até 30 segundos.</li>
              </ol>
              <p className="pt-1">
                Se já está rodando, clique em <strong>Reiniciar sessão</strong> abaixo para forçar um novo QR.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* QR Code Display (only if fresh) */}
        {session?.status === "qr_ready" && session.qr_code && !qrStale && (
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
              WhatsApp → Menu (⋯) → Aparelhos conectados → Conectar aparelho
            </p>
            <p className="text-[10px] text-muted-foreground">
              Expira em ~{Math.max(0, QR_STALE_SECONDS - qrAgeSec)}s
            </p>
          </div>
        )}

        {/* Connected info */}
        {session?.status === "connected" && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <Wifi className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-medium text-sm">WhatsApp conectado</p>
              {session.phone_number && <p className="text-xs text-muted-foreground">Número: {session.phone_number}</p>}
              {session.connected_at && (
                <p className="text-xs text-muted-foreground">
                  Desde: {new Date(session.connected_at).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full" onClick={initSession} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Reiniciar sessão / Pedir novo QR
        </Button>

        {/* Webhook URL */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Terminal className="h-3 w-3" /> URL do Webhook (para o Baileys local)
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted p-2 rounded font-mono truncate">{webhookUrl}</code>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyValue(webhookUrl, "url")}>
              {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            O servidor Baileys local envia eventos (qr, connected, disconnected, message) para esta URL.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
