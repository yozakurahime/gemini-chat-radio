import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Activity, MessageSquareWarning, Settings, ArrowRight, Server, ShieldCheck, Zap, CreditCard } from "lucide-react";
import { usePanelData } from "@/hooks/use-panel-data";

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    chats,
    systemHealth,
    refreshOpsDailySummary: rawRefreshOpsDailySummary,
  } = usePanelData();
  const refreshOpsDailySummary = rawRefreshOpsDailySummary || (async () => null);
  const [loadingQueues, setLoadingQueues] = useState(false);

  const runRefresh = async () => {
    setLoadingQueues(true);
    try {
      await refreshOpsDailySummary();
    } finally {
      setLoadingQueues(false);
    }
  };

  useEffect(() => {
    void runRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urgentChats = useMemo(
    () => (chats || []).filter((chat) => chat.attentionActive || chat.slaStatus === "critico" || chat.slaStatus === "atrasando").length,
    [chats],
  );

  return (
    <div className="min-h-screen bg-neutral-50/50 dark:bg-neutral-950/50 p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1 flex items-center gap-2">
            <Activity className="h-8 w-8 text-indigo-500" />
            Dashboard Operacional
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400">Visão em tempo real do sistema de ponto e atendimento.</p>
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <Button 
            variant="outline" 
            className="rounded-full shadow-sm hover:shadow-md transition-all gap-2 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20" 
            onClick={() => runRefresh()} 
            disabled={loadingQueues}
          >
            <RefreshCcw className={`h-4 w-4 ${loadingQueues ? "animate-spin text-indigo-500" : ""}`} /> 
            {loadingQueues ? "Sincronizando..." : "Sincronizar"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Atendimento Card */}
        <Card className="relative overflow-hidden group hover:shadow-xl transition-all duration-500 border-neutral-200/50 dark:border-neutral-800/50 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="pb-2">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center mb-4 text-rose-500 group-hover:scale-110 transition-transform duration-500">
              <MessageSquareWarning className="h-6 w-6" />
            </div>
            <CardDescription className="font-medium text-neutral-500">Conversas Urgentes</CardDescription>
            <CardTitle className="text-5xl font-light tracking-tighter mt-1">{urgentChats}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-4 flex items-center justify-between">
              <Badge variant={urgentChats > 0 ? "destructive" : "secondary"} className="rounded-full px-3 py-1 font-medium shadow-sm">
                {urgentChats > 0 ? "Ação Requerida" : "Tudo Estável"}
              </Badge>
              <Button variant="ghost" size="sm" className="rounded-full group/btn text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={() => navigate("/atendimento")}>
                Ver Atendimento
                <ArrowRight className="h-4 w-4 ml-1 group-hover/btn:translate-x-1 transition-transform" />
              </Button>
            </div>
          </CardContent>
        </Card>

        
        {/* Pix Card */}
        <Card className="relative overflow-hidden group hover:shadow-xl transition-all duration-500 border-neutral-200/50 dark:border-neutral-800/50 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="pb-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mb-4 text-emerald-500 group-hover:scale-110 transition-transform duration-500">
              <CreditCard className="h-6 w-6" />
            </div>
            <CardDescription className="font-medium text-neutral-500">Pix Pagos Hoje</CardDescription>
            <CardTitle className="text-5xl font-light tracking-tighter mt-1">{systemHealth?.metrics?.pix?.paidToday || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-4 flex items-center justify-between">
              <Badge variant="outline" className="rounded-full px-3 py-1 font-medium shadow-sm bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                Gerados hoje: {systemHealth?.metrics?.pix?.generatedToday || 0}
              </Badge>
              <Button variant="ghost" size="sm" className="rounded-full group/btn text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" onClick={() => navigate("/configuracoes")}>
                Planos
                <ArrowRight className="h-4 w-4 ml-1 group-hover/btn:translate-x-1 transition-transform" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Shortcuts Card */}
        <Card className="relative overflow-hidden group hover:shadow-xl transition-all duration-500 border-neutral-200/50 dark:border-neutral-800/50 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl lg:col-span-2">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader>
            <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center mb-4 text-blue-500 group-hover:scale-110 transition-transform duration-500">
              <Zap className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Acesso Rápido</CardTitle>
            <CardDescription>Pule direto para as funcionalidades principais.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div 
              onClick={() => navigate("/atendimento")}
              className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-blue-300 dark:hover:border-blue-700/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 cursor-pointer transition-all group/card flex items-center gap-4"
            >
              <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 shadow-sm text-blue-500 group-hover/card:scale-110 transition-transform">
                <MessageSquareWarning className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 group-hover/card:text-blue-600 dark:group-hover/card:text-blue-400 transition-colors">Atendimento</h3>
                <p className="text-sm text-neutral-500">Gerenciar conversas</p>
              </div>
            </div>
            
            <div 
              onClick={() => navigate("/configuracoes")}
              className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-indigo-300 dark:hover:border-indigo-700/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 cursor-pointer transition-all group/card flex items-center gap-4"
            >
              <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 shadow-sm text-indigo-500 group-hover/card:scale-110 transition-transform">
                <Settings className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 group-hover/card:text-indigo-600 dark:group-hover/card:text-indigo-400 transition-colors">Configurações</h3>
                <p className="text-sm text-neutral-500">Ajustes do sistema</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Health Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <Server className="h-5 w-5 text-neutral-500" />
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">Saúde do Sistema</h2>
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {!systemHealth?.components ? (
            <div className="col-span-full p-8 text-center rounded-3xl border border-dashed border-neutral-300 dark:border-neutral-800 text-neutral-500">
              <ShieldCheck className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>Diagnóstico indisponível no momento.</p>
            </div>
          ) : (
            Object.entries(systemHealth.components).slice(0, 8).map(([key, component]) => {
              const isError = component?.status === "critical";
              const isWarning = component?.status === "degraded";
              
              return (
                <div 
                  key={`health-${key}`} 
                  className={`relative overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-1 hover:shadow-lg
                    ${isError ? 'bg-rose-50/80 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50' : 
                      isWarning ? 'bg-amber-50/80 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50' : 
                      'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100 truncate">{key}</p>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 animate-pulse
                      ${isError ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' : 
                        isWarning ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 
                        'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'}`} 
                    />
                  </div>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2">
                    {String(component?.message || "Operando normalmente")}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
