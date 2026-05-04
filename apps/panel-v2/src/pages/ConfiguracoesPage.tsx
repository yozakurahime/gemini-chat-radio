import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Activity, Bot, KeyRound, MapPin, RotateCcw, Save, Send, Settings, Shield, TriangleAlert, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { usePanelData } from "@/hooks/use-panel-data";
import { apiFetch, jsonHeaders } from "@/lib/panel-api";
import { formatDateTimeBr as formatDateTimeBrTz } from "@/lib/date-time";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ManagedUser = {
  username: string;
  fullname?: string;
  role: "admin" | "user";
  active: boolean;
  created_at?: number;
  updated_at?: number;
};

type OpsAlertsConfig = {
  enabled: boolean;
  whatsappDestinations: string[];
  thresholds: {
    scaLagWarnSec: number;
    scaLagCriticalSec: number;
    backupWarnAgeMin: number;
    backupCriticalAgeMin: number;
    downtimeWarnMin: number;
    downtimeCriticalMin: number;
    cooldownMin: number;
    chatSlaDelayMin: number;
    chatSlaCriticalMin: number;
  };
  updatedAt?: number;
};

type ContextProfile = {
  version?: number;
  academy: {
    name: string;
    unit: string;
    address: string;
    phone: string;
    whatsapp: string;
    instagram: string;
    website: string;
  };
  hours: string;
  holidayRules: string;
  modalities: string;
  plans: string;
  enrollment: string;
  policies: string;
  service: {
    tone: string;
    humanHandoff: string;
    objections: string;
    faqs: string;
  };
  extraInfo: string;
  importedContext: string;
};

const OPS_ALERTS_DEFAULT: OpsAlertsConfig = {
  enabled: true,
  whatsappDestinations: [],
  thresholds: {
    scaLagWarnSec: 1800,
    scaLagCriticalSec: 5400,
    backupWarnAgeMin: 720,
    backupCriticalAgeMin: 1440,
    downtimeWarnMin: 2,
    downtimeCriticalMin: 5,
    cooldownMin: 15,
    chatSlaDelayMin: 5,
    chatSlaCriticalMin: 15,
  },
};

const EMPTY_CONTEXT_PROFILE: ContextProfile = {
  version: 1,
  academy: {
    name: "",
    unit: "",
    address: "",
    phone: "",
    whatsapp: "",
    instagram: "",
    website: "",
  },
  hours: "",
  holidayRules: "",
  modalities: "",
  plans: "",
  enrollment: "",
  policies: "",
  service: {
    tone: "Responda de forma clara, acolhedora e objetiva. Quando nao tiver certeza, chame um atendente humano.",
    humanHandoff: "Chame um atendente humano quando o cliente pedir atendimento humano, quando faltar informacao no contexto, quando houver reclamacao ou quando o assunto envolver pagamento/contrato sensivel.",
    objections: "",
    faqs: "",
  },
  extraInfo: "",
  importedContext: "",
};

function mergeContextProfile(raw: any, importedContext = ""): ContextProfile {
  return {
    ...EMPTY_CONTEXT_PROFILE,
    ...(raw || {}),
    academy: {
      ...EMPTY_CONTEXT_PROFILE.academy,
      ...(raw?.academy || {}),
    },
    service: {
      ...EMPTY_CONTEXT_PROFILE.service,
      ...(raw?.service || {}),
    },
    importedContext: String(raw?.importedContext ?? importedContext ?? ""),
  };
}

function authErrorMessage(code: string) {
  switch (code) {
    case "invalid_username":
      return "Usuario invalido. Use 3 a 60 caracteres: letras, numeros, ponto, traco ou underscore.";
    case "weak_password":
      return "Senha fraca. Use pelo menos 8 caracteres, com letra e numero.";
    case "user_exists":
      return "Esse usuario ja existe.";
    case "cannot_demote_self":
      return "Voce nao pode remover seu proprio perfil de admin.";
    case "cannot_disable_self":
      return "Voce nao pode desativar sua propria conta.";
    case "last_admin":
      return "Nao e permitido remover o ultimo admin ativo.";
    case "not_found":
      return "Usuario nao encontrado.";
    default:
      return "Falha ao processar acao de usuario.";
  }
}

function formatDateTimeBr(value?: number) {
  return formatDateTimeBrTz(value, "-");
}

function statusBadgeClass(status?: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "critical" || status === "critico") return "destructive";
  if (status === "degraded" || status === "atrasando") return "secondary";
  return "default";
}

export default function ConfiguracoesPage() {
  const { user, knowledgeBase, saveKnowledgeBase, geoPolicy, saveGeoPolicy, systemHealth } = usePanelData();
  const isAdmin = user?.role === "admin";

  const [aiContext, setAiContext] = useState("");
  const [contextProfile, setContextProfile] = useState<ContextProfile>(() => mergeContextProfile(null));
  const [loadingContextProfile, setLoadingContextProfile] = useState(false);
  const [savingContextProfile, setSavingContextProfile] = useState(false);
  const [hasSavedContextProfile, setHasSavedContextProfile] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isTestLoading, setIsTestLoading] = useState(false);

  const [gymLat, setGymLat] = useState("-23.5505");
  const [gymLng, setGymLng] = useState("-46.6333");
  const [gymRadius, setGymRadius] = useState("100");

  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [loadingManagedUsers, setLoadingManagedUsers] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [passwordUpdatingUser, setPasswordUpdatingUser] = useState<string>("");
  const [actionTarget, setActionTarget] = useState<string>("");
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [opsConfig, setOpsConfig] = useState<OpsAlertsConfig>(OPS_ALERTS_DEFAULT);
  const [opsDestinationsText, setOpsDestinationsText] = useState("");
  const [loadingOpsConfig, setLoadingOpsConfig] = useState(false);
  const [savingOpsConfig, setSavingOpsConfig] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    username: "",
    fullname: "",
    role: "user" as "admin" | "user",
    password: "",
  });

  const sortedUsers = useMemo(
    () => [...managedUsers].sort((a, b) => {
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return String(a.username || "").localeCompare(String(b.username || ""));
    }),
    [managedUsers],
  );

  const loadManagedUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingManagedUsers(true);
    try {
      const res = await apiFetch("/admin/users");
      const data = await res.json();
      setManagedUsers(Array.isArray(data?.users) ? data.users : []);
    } catch {
      toast.error("Falha ao carregar usuarios.");
      setManagedUsers([]);
    } finally {
      setLoadingManagedUsers(false);
    }
  }, [isAdmin]);

  const loadOpsConfig = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingOpsConfig(true);
    try {
      const res = await apiFetch("/admin/system/alerts/config");
      const data = await res.json();
      const next = {
        ...OPS_ALERTS_DEFAULT,
        ...(data?.config || {}),
        thresholds: {
          ...OPS_ALERTS_DEFAULT.thresholds,
          ...(data?.config?.thresholds || {}),
        },
      } as OpsAlertsConfig;
      setOpsConfig(next);
      setOpsDestinationsText((Array.isArray(next.whatsappDestinations) ? next.whatsappDestinations : []).join("\n"));
    } catch {
      toast.error("Falha ao carregar configuracao operacional.");
    } finally {
      setLoadingOpsConfig(false);
    }
  }, [isAdmin]);

  const loadContextProfile = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingContextProfile(true);
    try {
      const res = await apiFetch("/admin/knowledge/profile");
      const data = await res.json();
      const baseContext = String(data?.base_context || knowledgeBase || "");
      const profile = data?.profile
        ? mergeContextProfile(data.profile)
        : mergeContextProfile(null, baseContext);
      setContextProfile(profile);
      setHasSavedContextProfile(!!data?.profile);
      if (baseContext) setAiContext(baseContext);
    } catch {
      setContextProfile(mergeContextProfile(null, knowledgeBase || ""));
      setHasSavedContextProfile(false);
    } finally {
      setLoadingContextProfile(false);
    }
  }, [isAdmin, knowledgeBase]);

  const updateOpsThreshold = (key: keyof OpsAlertsConfig["thresholds"], value: string) => {
    const parsed = Number(value);
    setOpsConfig((prev) => ({
      ...prev,
      thresholds: {
        ...prev.thresholds,
        [key]: Number.isFinite(parsed) ? parsed : 0,
      },
    }));
  };

  const saveOpsConfig = async () => {
    if (!isAdmin || savingOpsConfig) return;
    setSavingOpsConfig(true);
    try {
      const destinations = opsDestinationsText
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = {
        enabled: !!opsConfig.enabled,
        whatsappDestinations: destinations,
        thresholds: {
          ...opsConfig.thresholds,
        },
      };
      const res = await apiFetch("/admin/system/alerts/config", {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const next = {
        ...OPS_ALERTS_DEFAULT,
        ...(data?.config || payload),
        thresholds: {
          ...OPS_ALERTS_DEFAULT.thresholds,
          ...(data?.config?.thresholds || payload.thresholds),
        },
      } as OpsAlertsConfig;
      setOpsConfig(next);
      setOpsDestinationsText((Array.isArray(next.whatsappDestinations) ? next.whatsappDestinations : []).join("\n"));
      toast.success("Configuracao operacional salva.");
    } catch {
      toast.error("Falha ao salvar configuracao operacional.");
    } finally {
      setSavingOpsConfig(false);
    }
  };

  useEffect(() => {
    setAiContext(knowledgeBase || "");
  }, [knowledgeBase]);

  useEffect(() => {
    if (!geoPolicy) return;
    if (geoPolicy.academy_lat !== null && geoPolicy.academy_lat !== undefined) setGymLat(String(geoPolicy.academy_lat));
    if (geoPolicy.academy_lng !== null && geoPolicy.academy_lng !== undefined) setGymLng(String(geoPolicy.academy_lng));
    if (geoPolicy.radius_m !== null && geoPolicy.radius_m !== undefined) setGymRadius(String(geoPolicy.radius_m));
  }, [geoPolicy]);

  useEffect(() => {
    if (!isAdmin) return;
    loadManagedUsers();
  }, [isAdmin, loadManagedUsers]);

  useEffect(() => {
    if (!isAdmin) return;
    loadOpsConfig();
  }, [isAdmin, loadOpsConfig]);

  useEffect(() => {
    if (!isAdmin) return;
    loadContextProfile();
  }, [isAdmin, loadContextProfile]);

  const handleSaveContext = () => {
    saveKnowledgeBase(aiContext);
  };

  const updateProfileAcademy = (key: keyof ContextProfile["academy"], value: string) => {
    setContextProfile((prev) => ({
      ...prev,
      academy: { ...prev.academy, [key]: value },
    }));
  };

  const updateProfileService = (key: keyof ContextProfile["service"], value: string) => {
    setContextProfile((prev) => ({
      ...prev,
      service: { ...prev.service, [key]: value },
    }));
  };

  const updateProfileField = (key: "hours" | "holidayRules" | "modalities" | "plans" | "enrollment" | "policies" | "extraInfo" | "importedContext", value: string) => {
    setContextProfile((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveProfile = async () => {
    if (!isAdmin || savingContextProfile) return;
    setSavingContextProfile(true);
    try {
      const res = await apiFetch("/admin/knowledge/profile/save", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ profile: contextProfile }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(String(data?.error || "save_failed"));
      setContextProfile(mergeContextProfile(data.profile || contextProfile));
      setHasSavedContextProfile(true);
      setAiContext(String(data.base_context || ""));
      toast.success("Contexto guiado salvo.");
    } catch (error: any) {
      const code = String(error?.message || "");
      toast.error(code === "too_short" ? "Preencha pelo menos algumas informacoes da academia." : "Falha ao salvar formulario de contexto.");
    } finally {
      setSavingContextProfile(false);
    }
  };

  const handleTestAI = async () => {
    if (!testMessage.trim()) return;
    setIsTestLoading(true);
    window.setTimeout(() => {
      setTestResponse("A resposta final sera gerada pelo bot com base no contexto salvo.");
      setIsTestLoading(false);
    }, 800);
  };

  const handleCreateUser = async () => {
    if (!isAdmin || creatingUser) return;
    const username = newUserForm.username.trim().toLowerCase();
    const fullname = newUserForm.fullname.trim();
    const password = newUserForm.password.trim();
    if (!username || !password) {
      toast.error("Preencha usuario e senha.");
      return;
    }
    setCreatingUser(true);
    try {
      await apiFetch("/admin/users", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          username,
          fullname,
          role: newUserForm.role,
          password,
        }),
      });
      toast.success("Usuario criado.");
      setNewUserForm({ username: "", fullname: "", role: "user", password: "" });
      await loadManagedUsers();
    } catch (error: any) {
      toast.error(authErrorMessage(String(error?.code || "")));
    } finally {
      setCreatingUser(false);
    }
  };

  const updateUser = async (username: string, payload: Record<string, unknown>) => {
    setActionTarget(username);
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(username)}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      await loadManagedUsers();
      return true;
    } catch (error: any) {
      toast.error(authErrorMessage(String(error?.code || "")));
      return false;
    } finally {
      setActionTarget("");
    }
  };

  const disableUser = async (username: string) => {
    setActionTarget(username);
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(username)}`, { method: "DELETE" });
      toast.success("Usuario desativado.");
      await loadManagedUsers();
    } catch (error: any) {
      toast.error(authErrorMessage(String(error?.code || "")));
    } finally {
      setActionTarget("");
    }
  };

  const resetUserPassword = async (username: string) => {
    const nextPassword = String(passwordDrafts[username] || "").trim();
    if (!nextPassword) {
      toast.error("Digite a nova senha.");
      return;
    }
    setPasswordUpdatingUser(username);
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(username)}/password`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ password: nextPassword }),
      });
      toast.success("Senha atualizada.");
      setPasswordDrafts((prev) => ({ ...prev, [username]: "" }));
    } catch (error: any) {
      toast.error(authErrorMessage(String(error?.code || "")));
    } finally {
      setPasswordUpdatingUser("");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Configuracoes</h1>
      </div>

      <Tabs defaultValue="ai" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ai" className="gap-1">
            <Bot className="h-4 w-4" /> Contexto da IA
          </TabsTrigger>
          <TabsTrigger value="location" className="gap-1">
            <MapPin className="h-4 w-4" /> Localizacao
          </TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="operacao" className="gap-1">
              <Activity className="h-4 w-4" /> Operacao
            </TabsTrigger>
          ) : null}
          {isAdmin ? (
            <TabsTrigger value="access" className="gap-1">
              <Shield className="h-4 w-4" /> Acessos
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="ai" className="space-y-4">
          <Tabs defaultValue="guided" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList>
                <TabsTrigger value="guided" className="gap-1">
                  <Bot className="h-4 w-4" /> Formulario guiado
                </TabsTrigger>
                <TabsTrigger value="advanced" className="gap-1">
                  <Settings className="h-4 w-4" /> Texto avancado
                </TabsTrigger>
              </TabsList>
              {isAdmin && (!hasSavedContextProfile || aiContext.trim().length < 80) ? (
                <Badge variant="secondary">Setup inicial recomendado</Badge>
              ) : null}
            </div>

            <TabsContent value="guided" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4" /> Formulario para montar o contexto
                  </CardTitle>
                  <CardDescription>
                    Preencha os campos principais. O sistema monta um texto organizado para a IA usar no atendimento.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {!isAdmin ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      Apenas administradores podem alterar o contexto da IA.
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome da academia</Label>
                      <Input value={contextProfile.academy.name} onChange={(event) => updateProfileAcademy("name", event.target.value)} placeholder="Academia Oxigenio" disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Unidade</Label>
                      <Input value={contextProfile.academy.unit} onChange={(event) => updateProfileAcademy("unit", event.target.value)} placeholder="Matriz, bairro ou cidade" disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Endereco</Label>
                      <Textarea value={contextProfile.academy.address} onChange={(event) => updateProfileAcademy("address", event.target.value)} placeholder="Rua, numero, bairro, cidade e ponto de referencia" disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefone</Label>
                      <Input value={contextProfile.academy.phone} onChange={(event) => updateProfileAcademy("phone", event.target.value)} placeholder="(00) 0000-0000" disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>WhatsApp</Label>
                      <Input value={contextProfile.academy.whatsapp} onChange={(event) => updateProfileAcademy("whatsapp", event.target.value)} placeholder="(00) 00000-0000" disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Instagram</Label>
                      <Input value={contextProfile.academy.instagram} onChange={(event) => updateProfileAcademy("instagram", event.target.value)} placeholder="@academia" disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Site</Label>
                      <Input value={contextProfile.academy.website} onChange={(event) => updateProfileAcademy("website", event.target.value)} placeholder="https://..." disabled={!isAdmin} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Horarios de funcionamento</Label>
                      <Textarea className="min-h-[140px]" value={contextProfile.hours} onChange={(event) => updateProfileField("hours", event.target.value)} placeholder={"Segunda a sexta: 06h as 22h\nSabado: 08h as 12h"} disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Feriados e horarios especiais</Label>
                      <Textarea className="min-h-[140px]" value={contextProfile.holidayRules} onChange={(event) => updateProfileField("holidayRules", event.target.value)} placeholder="Explique se abre em feriados, recessos ou horarios especiais." disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Modalidades, aulas e frequencia</Label>
                      <Textarea className="min-h-[160px]" value={contextProfile.modalities} onChange={(event) => updateProfileField("modalities", event.target.value)} placeholder={"Musculacao: acesso livre conforme plano\nHidroginastica: 3 vezes por semana\nPilates: mediante agendamento"} disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Planos e valores</Label>
                      <Textarea className="min-h-[140px]" value={contextProfile.plans} onChange={(event) => updateProfileField("plans", event.target.value)} placeholder="Liste planos, valores, recorrencia e o que esta incluso." disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Matricula e pagamento</Label>
                      <Textarea className="min-h-[140px]" value={contextProfile.enrollment} onChange={(event) => updateProfileField("enrollment", event.target.value)} placeholder="Documentos, taxa de matricula, formas de pagamento e vencimentos." disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Regras e politicas</Label>
                      <Textarea className="min-h-[140px]" value={contextProfile.policies} onChange={(event) => updateProfileField("policies", event.target.value)} placeholder="Cancelamento, reposicao, atestado, convidados, aula experimental e faltas." disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Tom de atendimento da IA</Label>
                      <Textarea className="min-h-[130px]" value={contextProfile.service.tone} onChange={(event) => updateProfileService("tone", event.target.value)} disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Quando chamar humano</Label>
                      <Textarea className="min-h-[130px]" value={contextProfile.service.humanHandoff} onChange={(event) => updateProfileService("humanHandoff", event.target.value)} disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Objecoes comuns</Label>
                      <Textarea className="min-h-[130px]" value={contextProfile.service.objections} onChange={(event) => updateProfileService("objections", event.target.value)} placeholder="Ex: esta caro, quero desconto, tenho pouco tempo..." disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2">
                      <Label>Perguntas frequentes</Label>
                      <Textarea className="min-h-[130px]" value={contextProfile.service.faqs} onChange={(event) => updateProfileService("faqs", event.target.value)} placeholder="Pergunta: ...\nResposta: ..." disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Informacoes importantes adicionais</Label>
                      <Textarea className="min-h-[120px]" value={contextProfile.extraInfo} onChange={(event) => updateProfileField("extraInfo", event.target.value)} placeholder="Qualquer detalhe importante que nao entrou nos campos acima." disabled={!isAdmin} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Informacoes atuais/importadas</Label>
                      <Textarea className="min-h-[120px]" value={contextProfile.importedContext} onChange={(event) => updateProfileField("importedContext", event.target.value)} placeholder="Contexto antigo preservado quando ainda nao existe formulario salvo." disabled={!isAdmin} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {loadingContextProfile ? "Carregando formulario..." : hasSavedContextProfile ? "Formulario salvo e reutilizavel." : "Ainda nao ha formulario estruturado salvo."}
                    </p>
                    <Button className="gap-1" onClick={handleSaveProfile} disabled={!isAdmin || savingContextProfile}>
                      <Save className="h-4 w-4" /> {savingContextProfile ? "Salvando..." : "Salvar formulario e gerar contexto"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="h-4 w-4" /> Texto avancado da IA
                  </CardTitle>
                  <CardDescription>
                    Este texto final e salvo na base de conhecimento atual do sistema e usado pelo atendimento automatico.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={aiContext}
                    onChange={(event) => setAiContext(event.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                    placeholder="Digite aqui todas as informacoes da academia..."
                    disabled={!isAdmin}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {aiContext.length} caracteres
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" className="gap-1" onClick={() => setAiContext("")} disabled={!isAdmin}>
                        <RotateCcw className="h-4 w-4" /> Limpar
                      </Button>
                      <Button className="gap-1" onClick={handleSaveContext} disabled={!isAdmin}>
                        <Save className="h-4 w-4" /> Salvar texto
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Testar resposta da IA</CardTitle>
              <CardDescription>
                Envie uma mensagem de teste para revisar o contexto antes de salvar ajustes maiores.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Qual o horario de funcionamento?"
                  value={testMessage}
                  onChange={(event) => setTestMessage(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleTestAI()}
                />
                <Button onClick={handleTestAI} disabled={isTestLoading} className="gap-1">
                  <Send className="h-4 w-4" /> Testar
                </Button>
              </div>
              {testResponse ? (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-1 mb-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                      IA
                    </Badge>
                  </div>
                  <p className="text-sm">{testResponse}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Localizacao da academia
              </CardTitle>
              <CardDescription>
                Configure coordenadas e raio de proximidade para validacao do ponto dos funcionarios.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Latitude</Label>
                  <Input value={gymLat} onChange={(event) => setGymLat(event.target.value)} placeholder="-23.5505" />
                </div>
                <div className="space-y-2">
                  <Label>Longitude</Label>
                  <Input value={gymLng} onChange={(event) => setGymLng(event.target.value)} placeholder="-46.6333" />
                </div>
                <div className="space-y-2">
                  <Label>Raio (metros)</Label>
                  <Input value={gymRadius} onChange={(event) => setGymRadius(event.target.value)} placeholder="100" type="number" />
                </div>
              </div>
              <Button className="gap-1" onClick={() => saveGeoPolicy({ academyLat: gymLat, academyLng: gymLng, radiusM: gymRadius })}>
                <Save className="h-4 w-4" /> Salvar localizacao
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="operacao" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Saude operacional
                  </CardTitle>
                  <CardDescription>
                    Visao de incidentes e estado dos componentes em tempo real.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={loadOpsConfig} disabled={loadingOpsConfig}>
                  Atualizar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status geral:</span>
                  <Badge variant={statusBadgeClass(systemHealth?.status)}>
                    {String(systemHealth?.status || "desconhecido")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Atualizado: {formatDateTimeBr(systemHealth?.generatedAt)}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(systemHealth?.components || {}).map(([component, info]: [string, any]) => (
                    <div key={component} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{component}</p>
                        <Badge variant={statusBadgeClass(info?.status)}>{String(info?.status || "ok")}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{String(info?.message || "-")}</p>
                    </div>
                  ))}
                </div>
                {(systemHealth?.incidents || []).length > 0 ? (
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <TriangleAlert className="h-4 w-4 text-amber-500" /> Incidentes abertos
                    </p>
                    {(systemHealth?.incidents || []).map((incident: any) => (
                      <div key={incident.id} className="text-xs text-muted-foreground">
                        <strong>{incident.component}</strong>: {incident.message} ({String(incident.status || "-")})
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum incidente aberto no momento.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Alertas operacionais
                </CardTitle>
                <CardDescription>
                  Configure destinos no WhatsApp e limites de degradacao/criticidade.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Alertas habilitados</p>
                    <p className="text-xs text-muted-foreground">Painel em tempo real + envio complementar no WhatsApp admin.</p>
                  </div>
                  <Switch
                    checked={!!opsConfig.enabled}
                    onCheckedChange={(checked) => setOpsConfig((prev) => ({ ...prev, enabled: checked }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Destinos WhatsApp (um por linha)</Label>
                  <Textarea
                    value={opsDestinationsText}
                    onChange={(event) => setOpsDestinationsText(event.target.value)}
                    className="min-h-[110px] font-mono text-xs"
                    placeholder="5511999999999@s.whatsapp.net"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Lag SCA aviso (seg)</Label>
                    <Input type="number" value={opsConfig.thresholds.scaLagWarnSec} onChange={(event) => updateOpsThreshold("scaLagWarnSec", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Lag SCA critico (seg)</Label>
                    <Input type="number" value={opsConfig.thresholds.scaLagCriticalSec} onChange={(event) => updateOpsThreshold("scaLagCriticalSec", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Backup aviso (min)</Label>
                    <Input type="number" value={opsConfig.thresholds.backupWarnAgeMin} onChange={(event) => updateOpsThreshold("backupWarnAgeMin", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Backup critico (min)</Label>
                    <Input type="number" value={opsConfig.thresholds.backupCriticalAgeMin} onChange={(event) => updateOpsThreshold("backupCriticalAgeMin", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Downtime aviso (min)</Label>
                    <Input type="number" value={opsConfig.thresholds.downtimeWarnMin} onChange={(event) => updateOpsThreshold("downtimeWarnMin", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Downtime critico (min)</Label>
                    <Input type="number" value={opsConfig.thresholds.downtimeCriticalMin} onChange={(event) => updateOpsThreshold("downtimeCriticalMin", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cooldown alerta (min)</Label>
                    <Input type="number" value={opsConfig.thresholds.cooldownMin} onChange={(event) => updateOpsThreshold("cooldownMin", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>SLA chat atrasando (min)</Label>
                    <Input type="number" value={opsConfig.thresholds.chatSlaDelayMin} onChange={(event) => updateOpsThreshold("chatSlaDelayMin", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>SLA chat critico (min)</Label>
                    <Input type="number" value={opsConfig.thresholds.chatSlaCriticalMin} onChange={(event) => updateOpsThreshold("chatSlaCriticalMin", event.target.value)} />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button className="gap-1" onClick={saveOpsConfig} disabled={savingOpsConfig || loadingOpsConfig}>
                    <Save className="h-4 w-4" /> Salvar alertas
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {isAdmin ? (
          <TabsContent value="access" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Cadastrar usuario
                </CardTitle>
                <CardDescription>
                  Apenas admin pode criar contas. Voce pode criar atendentes ou outros admins.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Usuario</Label>
                    <Input
                      placeholder="ex: atendente1"
                      value={newUserForm.username}
                      onChange={(event) => setNewUserForm((prev) => ({ ...prev, username: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome completo</Label>
                    <Input
                      placeholder="Nome visivel no painel"
                      value={newUserForm.fullname}
                      onChange={(event) => setNewUserForm((prev) => ({ ...prev, fullname: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de conta</Label>
                    <Select
                      value={newUserForm.role}
                      onValueChange={(value: "admin" | "user") => setNewUserForm((prev) => ({ ...prev, role: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Atendente</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Senha inicial</Label>
                    <Input
                      type="password"
                      placeholder="Min 8 caracteres com letra e numero"
                      value={newUserForm.password}
                      onChange={(event) => setNewUserForm((prev) => ({ ...prev, password: event.target.value }))}
                    />
                  </div>
                </div>
                <Button className="gap-1" onClick={handleCreateUser} disabled={creatingUser}>
                  <UserPlus className="h-4 w-4" /> Criar usuario
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" /> Usuarios cadastrados
                  </CardTitle>
                  <CardDescription>
                    Controle de perfis, status e senha.
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={loadManagedUsers} disabled={loadingManagedUsers}>
                  Atualizar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {sortedUsers.length ? (
                  sortedUsers.map((account) => {
                    const isSelf = String(account.username || "").toLowerCase() === String(user?.username || "").toLowerCase();
                    const draftPassword = String(passwordDrafts[account.username] || "");
                    const busy = actionTarget === account.username || passwordUpdatingUser === account.username;
                    return (
                      <div key={account.username} className="rounded-lg border p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{account.fullname || account.username}</p>
                            <p className="text-xs text-muted-foreground">@{account.username}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={account.role === "admin" ? "default" : "secondary"}>
                              {account.role === "admin" ? "Admin" : "Atendente"}
                            </Badge>
                            <Badge variant={account.active ? "default" : "outline"}>
                              {account.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || isSelf}
                            onClick={() => updateUser(account.username, { role: account.role === "admin" ? "user" : "admin" })}
                          >
                            {account.role === "admin" ? "Tornar atendente" : "Promover para admin"}
                          </Button>

                          {account.active ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || isSelf}
                              onClick={() => disableUser(account.username)}
                            >
                              Desativar
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => updateUser(account.username, { active: true })}
                            >
                              Reativar
                            </Button>
                          )}
                        </div>

                        <div className="flex flex-col md:flex-row gap-2">
                          <Input
                            type="password"
                            placeholder="Nova senha para esse usuario"
                            value={draftPassword}
                            onChange={(event) => setPasswordDrafts((prev) => ({ ...prev, [account.username]: event.target.value }))}
                          />
                          <Button
                            variant="outline"
                            className="gap-1"
                            disabled={busy || !draftPassword.trim()}
                            onClick={() => resetUserPassword(account.username)}
                          >
                            <KeyRound className="h-4 w-4" /> Trocar senha
                          </Button>
                        </div>

                        <p className="text-[11px] text-muted-foreground">
                          Criado: {formatDateTimeBr(account.created_at)} | Atualizado: {formatDateTimeBr(account.updated_at)}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground text-center">
                    {loadingManagedUsers ? "Carregando usuarios..." : "Nenhum usuario cadastrado."}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
