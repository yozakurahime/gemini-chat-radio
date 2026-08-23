import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone, Wifi, WifiOff, RefreshCw, QrCode, Copy, Check } from "lucide-react";
import { apiFetch } from "@/lib/panel-api";
import { toast } from "sonner";

type WhatsAppStatus = {
  status?: string;
  connected?: boolean;
  phone?: string;
  phone_number?: string;
  last_error?: string;
  lastError?: string;
  lastErrorCode?: number;
  pairing_code?: string;
  pairing?: {
    available?: boolean;
    code?: string;
    updated_at?: number;
  };
  qr?: {
    available?: boolean;
    qr?: string;
    qr_url?: string;
    updated_at?: number;
  };
};

export default function WhatsAppConnect() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/admin/whatsapp/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ status: "offline" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = window.setInterval(fetchStatus, 5000);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  const qrUrl = status?.qr?.qr_url || "";
  const phone = status?.phone_number || status?.phone || "";
  const state = status?.connected ? "connected" : status?.qr?.available ? "qr_ready" : status?.status || "disconnected";
  const pairingCode = status?.pairing?.code || status?.pairing_code || "";
  const lastError = status?.lastError || status?.last_error || "";

  const copyQr = () => {
    const value = status?.qr?.qr || pairingCode || "";
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Codigo copiado");
    window.setTimeout(() => setCopied(false), 2000);
  };

  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    connected: { label: "Conectado", color: "bg-green-500", icon: <Wifi className="h-4 w-4" /> },
    qr_ready: { label: "QR Code pronto", color: "bg-yellow-500", icon: <QrCode className="h-4 w-4" /> },
    connecting: { label: "Conectando", color: "bg-blue-500", icon: <RefreshCw className="h-4 w-4 animate-spin" /> },
    pairing_code_ready: { label: "Código pronto", color: "bg-yellow-500", icon: <Smartphone className="h-4 w-4" /> },
    relogin_required: { label: "Reconectar", color: "bg-orange-500", icon: <QrCode className="h-4 w-4" /> },
    client_update_required: { label: "Atualização necessária", color: "bg-orange-500", icon: <RefreshCw className="h-4 w-4" /> },
    disconnected: { label: "Desconectado", color: "bg-muted-foreground", icon: <WifiOff className="h-4 w-4" /> },
    offline: { label: "Sem resposta", color: "bg-destructive", icon: <WifiOff className="h-4 w-4" /> },
  };

  const currentStatus = statusConfig[state] || statusConfig.disconnected;

  if (state === "connected") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-3 py-2 shadow-sm backdrop-blur-md dark:border-emerald-500/20 dark:bg-emerald-500/10">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500 text-white shadow-sm">
          <Wifi className="h-4 w-4" />
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">WhatsApp conectado</p>
          <p className="text-[10px] text-emerald-700/70 dark:text-emerald-300/70">{phone || "Sessão ativa"}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-emerald-700 hover:bg-emerald-500/10" onClick={fetchStatus} disabled={loading} title="Atualizar conexão">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    );
  }

  return (
    <Card className="panel-soft overflow-hidden rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Conexao WhatsApp
          </div>
          <Badge variant="outline" className="gap-1.5">
            <span className={`h-2 w-2 rounded-full ${currentStatus.color}`} />
            {currentStatus.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === "qr_ready" && qrUrl ? (
          <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-lg border">
            <p className="text-sm font-medium text-foreground">Escaneie o QR Code no WhatsApp</p>
            <div className="bg-white p-4 rounded-lg">
              <img src={qrUrl} alt="QR Code WhatsApp" className="w-64 h-64" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Abra o WhatsApp, entre em aparelhos conectados e aponte a camera para este codigo.
            </p>
          </div>
        ) : null}

        {state === "connected" ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <Wifi className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-medium text-sm">WhatsApp conectado</p>
              {phone ? <p className="text-xs text-muted-foreground">Numero: {phone}</p> : null}
            </div>
          </div>
        ) : null}

        {state !== "connected" && state !== "qr_ready" ? (
          <div className="text-center space-y-3 py-4">
            <WifiOff className="h-12 w-12 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {state === "client_update_required"
                ? "A versão do conector precisa ser atualizada. A sessão foi preservada e a conexão será retomada depois da atualização."
                : state === "relogin_required"
                  ? "A sessão do WhatsApp foi encerrada. Aguarde o novo QR Code para conectar novamente."
                  : "WhatsApp ainda não conectado. O QR aparece aqui quando o Baileys local gera uma nova sessão."}
            </p>
            {lastError ? (
              <p className="text-xs text-destructive">Último erro: {lastError}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground">Sessao local Baileys</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted p-2 rounded font-mono truncate">
              {pairingCode || (status?.qr?.available ? "QR disponivel" : "Aguardando QR")}
            </code>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copyQr} disabled={!status?.qr?.qr && !pairingCode}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={fetchStatus} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
