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
  pairing_code?: string;
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
  const pairingCode = status?.pairing_code || "";

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
    disconnected: { label: "Desconectado", color: "bg-muted-foreground", icon: <WifiOff className="h-4 w-4" /> },
    offline: { label: "Sem resposta", color: "bg-destructive", icon: <WifiOff className="h-4 w-4" /> },
  };

  const currentStatus = statusConfig[state] || statusConfig.disconnected;

  return (
    <Card>
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
              WhatsApp ainda nao conectado. O QR aparece aqui quando o Baileys local gera uma nova sessao.
            </p>
            {status?.last_error ? (
              <p className="text-xs text-destructive">Ultimo erro: {status.last_error}</p>
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
