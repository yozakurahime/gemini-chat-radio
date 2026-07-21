import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Activity, Bot, CalendarClock, CreditCard, Download, KeyRound, MapPin, Pencil, Plus, RotateCcw, Save, Send, Settings, Shield, Trash2, TriangleAlert, Upload, UserPlus, Users } from "lucide-react";
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

type PixPlan = {
  id: number;
  name: string;
  amount_cents: number;
  active: number;
};

type PixSafeConfig = {
  enabled: boolean;
  requireOptIn: boolean;
  maxRemindersPerCharge: number;
  firstReminderAfterMin: number;
  reminderIntervalMin: number;
  quietHourStart: number;
  quietHourEnd: number;
  updatedAt?: number;
};

type PixDailyImport = {
  id: number;
  original_filename: string;
  source_ext: string;
  csv_filename: string;
  rows_count: number;
  columns_count: number;
  uploaded_by?: string;
  created_at?: number;
};
type AiPlaybooks = {
  enabled: boolean;
  sections: {
    mensalidade: string;
    modalidades: string;
    matricula: string;
    objecoes: string;
  };
  updated_at?: number;
  updated_by?: string;
};

type ModalityAvailabilityEntry = {
  id: string;
  modality: string;
  className: string;
  schedule: string;
  status: "available" | "full" | "waitlist" | "unavailable";
  availableSpots: number | null;
  capacity: number | null;
  note: string;
  active: boolean;
  validUntil: number;
  updatedAt?: number;
  updatedBy?: string;
};

const EMPTY_AVAILABILITY_FORM = {
  id: "",
  modality: "",
  className: "",
  schedule: "",
  status: "available" as ModalityAvailabilityEntry["status"],
  availableSpots: "",
  capacity: "",
  note: "",
  active: true,
  validUntil: "",
};

const PIX_SAFE_DEFAULT: PixSafeConfig = {
  enabled: true,
  requireOptIn: true,
  maxRemindersPerCharge: 2,
  firstReminderAfterMin: 120,
  reminderIntervalMin: 1440,
  quietHourStart: 8,
  quietHourEnd: 20,
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

const AI_PLAYBOOKS_DEFAULT: AiPlaybooks = {
  enabled: true,
  sections: {
    mensalidade: "Quando perguntarem valor da mensalidade ou preco de plano, responda com os valores que existirem no contexto. Se nao houver valor no contexto, diga que vai confirmar com o atendimento humano antes de fechar.",
    modalidades: "Quando perguntarem modalidades, responda com lista objetiva (nome, frequencia, publico e observacoes) priorizando clareza comercial.",
    matricula: "Quando pedirem matricula, explique documentos, forma de pagamento, etapas e ofereca concluir com atendente humano.",
    objecoes: "Quando houver indecisao (tempo, preco, distancia), responda com empatia, destaque beneficios praticos e convide para teste/aula experimental quando houver no contexto.",
  },
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

function digitsOnly(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

function availabilityDateInput(timestamp?: number) {
  if (!timestamp) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return "";
  }
}

function availabilityEndOfDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  return new Date(`${date}T23:59:59.999-03:00`).getTime();
}

function buildWhatsappLink(phone: string, studentName: string) {
  const digits = digitsOnly(phone);
  if (!digits) return "";
  const text = encodeURIComponent(`Oi ${studentName || "tudo bem"}! Sentimos sua falta na academia. Posso te ajudar com algo?`);
  return `https://wa.me/${digits}?text=${text}`;
}

function statusBadgeClass(status?: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "critical" || status === "critico") return "destructive";
  if (status === "degraded" || status === "atrasando") return "secondary";
  return "default";
}

export default function ConfiguracoesPage() {
  const panelData = usePanelData();
  const {
    user,
    knowledgeBase,
    saveKnowledgeBase,
    geoPolicy,
    saveGeoPolicy,
    systemHealth,
    pixPlans,
    refreshPixPlans,
    createPixPlan,
    updatePixPlan,
    deletePixPlan,
    pixSafeConfig,
    loadPixSafeConfig,
    savePixSafeConfig,
    pixDailyImports,
    refreshPixDailyImports,
    uploadPixDailyImport,
    aiPlaybooks,
    loadAiPlaybooks: rawLoadAiPlaybooks,
    saveAiPlaybooks: rawSaveAiPlaybooks,
  } = panelData;
  const loadAiPlaybooks = rawLoadAiPlaybooks || (async () => null);
  const saveAiPlaybooks = rawSaveAiPlaybooks || (async () => false);
  const isAdmin = user?.role === "admin";

  const [aiContext, setAiContext] = useState("");
  const [contextProfile, setContextProfile] = useState<ContextProfile>(() => mergeContextProfile(null));
  const [loadingContextProfile, setLoadingContextProfile] = useState(false);
  const [savingContextProfile, setSavingContextProfile] = useState(false);
  const [hasSavedContextProfile, setHasSavedContextProfile] = useState(false);
  const [aiPlaybooksDraft, setAiPlaybooksDraft] = useState<AiPlaybooks>(AI_PLAYBOOKS_DEFAULT);
  const [savingAiPlaybooks, setSavingAiPlaybooks] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isTestLoading, setIsTestLoading] = useState(false);
  const [availabilityEntries, setAvailabilityEntries] = useState<ModalityAvailabilityEntry[]>([]);
  const [availabilityForm, setAvailabilityForm] = useState(EMPTY_AVAILABILITY_FORM);
  const [availabilityUpdatedAt, setAvailabilityUpdatedAt] = useState(0);
  const [availabilityUpdatedBy, setAvailabilityUpdatedBy] = useState("");
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);

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
  const [pixPlanName, setPixPlanName] = useState("");
  const [pixPlanAmount, setPixPlanAmount] = useState("");
  const [pixSaving, setPixSaving] = useState(false);
  const [pixEditingId, setPixEditingId] = useState<number>(0);
  const [pixEditingName, setPixEditingName] = useState("");
  const [pixEditingAmount, setPixEditingAmount] = useState("");
  const [pixSafeDraft, setPixSafeDraft] = useState<PixSafeConfig>(PIX_SAFE_DEFAULT);
  const [pixSafeSaving, setPixSafeSaving] = useState(false);
  const [dailyImportFile, setDailyImportFile] = useState<File | null>(null);
  const [dailyImportSending, setDailyImportSending] = useState(false);

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

  const loadAvailability = useCallback(async () => {
    setLoadingAvailability(true);
    try {
      const res = await apiFetch("/admin/knowledge/availability");
      const data = await res.json();
      if (!res.ok) throw new Error(String(data?.error || "load_failed"));
      const availability = data?.availability || {};
      setAvailabilityEntries(Array.isArray(availability.entries) ? availability.entries : []);
      setAvailabilityUpdatedAt(Number(availability.updatedAt || 0));
      setAvailabilityUpdatedBy(String(availability.updatedBy || ""));
    } catch {
      setAvailabilityEntries([]);
      toast.error("Falha ao carregar as vagas por modalidade.");
    } finally {
      setLoadingAvailability(false);
    }
  }, []);

  const saveAvailability = async () => {
    if (!isAdmin || savingAvailability) return;
    setSavingAvailability(true);
    try {
      const res = await apiFetch("/admin/knowledge/availability/save", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ availability: { entries: availabilityEntries } }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(String(data?.error || "save_failed"));
      const availability = data.availability || {};
      setAvailabilityEntries(Array.isArray(availability.entries) ? availability.entries : []);
      setAvailabilityUpdatedAt(Number(availability.updatedAt || 0));
      setAvailabilityUpdatedBy(String(availability.updatedBy || ""));
      toast.success("Vagas atualizadas no contexto da Hime.");
    } catch {
      toast.error("Falha ao salvar as vagas.");
    } finally {
      setSavingAvailability(false);
    }
  };

  const upsertAvailabilityEntry = () => {
    const modality = availabilityForm.modality.trim();
    if (!modality) {
      toast.error("Informe a modalidade.");
      return;
    }
    if (availabilityForm.active && !availabilityForm.validUntil) {
      toast.error("Informe a data de validade para evitar que a IA use uma vaga antiga.");
      return;
    }
    if (availabilityForm.status === "available" && availabilityForm.availableSpots.trim() === "") {
      toast.error("Informe quantas vagas estão disponíveis.");
      return;
    }
    const availableSpots = availabilityForm.status === "full" && availabilityForm.availableSpots.trim() === ""
      ? 0
      : availabilityForm.availableSpots.trim() === ""
      ? null
      : Math.max(0, Number.parseInt(availabilityForm.availableSpots, 10) || 0);
    const capacity = availabilityForm.capacity.trim() === ""
      ? null
      : Math.max(1, Number.parseInt(availabilityForm.capacity, 10) || 1);
    const next: ModalityAvailabilityEntry = {
      id: availabilityForm.id || `vaga-${Date.now()}`,
      modality,
      className: availabilityForm.className.trim(),
      schedule: availabilityForm.schedule.trim(),
      status: availableSpots === 0 && availabilityForm.status === "available" ? "full" : availabilityForm.status,
      availableSpots,
      capacity,
      note: availabilityForm.note.trim(),
      active: availabilityForm.active,
      validUntil: availabilityEndOfDay(availabilityForm.validUntil),
    };
    setAvailabilityEntries((current) => {
      const found = current.some((entry) => entry.id === next.id);
      return found ? current.map((entry) => entry.id === next.id ? next : entry) : [...current, next];
    });
    setAvailabilityForm(EMPTY_AVAILABILITY_FORM);
  };

  const editAvailabilityEntry = (entry: ModalityAvailabilityEntry) => {
    setAvailabilityForm({
      id: entry.id,
      modality: entry.modality,
      className: entry.className || "",
      schedule: entry.schedule || "",
      status: entry.status,
      availableSpots: entry.availableSpots === null ? "" : String(entry.availableSpots),
      capacity: entry.capacity === null ? "" : String(entry.capacity),
      note: entry.note || "",
      active: entry.active !== false,
      validUntil: availabilityDateInput(entry.validUntil),
    });
  };

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

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAiPlaybooks();
  }, [isAdmin, loadAiPlaybooks]);

  useEffect(() => {
    const source = aiPlaybooks || AI_PLAYBOOKS_DEFAULT;
    setAiPlaybooksDraft({
      enabled: source.enabled !== false,
      sections: {
        mensalidade: String(source.sections?.mensalidade || AI_PLAYBOOKS_DEFAULT.sections.mensalidade),
        modalidades: String(source.sections?.modalidades || AI_PLAYBOOKS_DEFAULT.sections.modalidades),
        matricula: String(source.sections?.matricula || AI_PLAYBOOKS_DEFAULT.sections.matricula),
        objecoes: String(source.sections?.objecoes || AI_PLAYBOOKS_DEFAULT.sections.objecoes),
      },
      updated_at: source.updated_at,
      updated_by: source.updated_by,
    });
  }, [aiPlaybooks]);

  useEffect(() => {
    if (!isAdmin) return;
    refreshPixPlans();
    loadPixSafeConfig();
    refreshPixDailyImports();
  }, [isAdmin, refreshPixPlans, loadPixSafeConfig, refreshPixDailyImports]);

  useEffect(() => {
    if (!pixSafeConfig) return;
    setPixSafeDraft({
      ...PIX_SAFE_DEFAULT,
      ...pixSafeConfig,
    });
  }, [pixSafeConfig]);

  const parsePixAmountToCents = (rawValue: string) => {
    const normalized = String(rawValue || "").replace(/\./g, "").replace(",", ".").trim();
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value * 100);
  };

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

  const updatePlaybookField = (field: keyof AiPlaybooks["sections"], value: string) => {
    setAiPlaybooksDraft((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [field]: value,
      },
    }));
  };

  const handleSavePlaybooks = async () => {
    if (!isAdmin || savingAiPlaybooks) return;
    setSavingAiPlaybooks(true);
    try {
      const ok = await saveAiPlaybooks({
        enabled: !!aiPlaybooksDraft.enabled,
        sections: {
          mensalidade: String(aiPlaybooksDraft.sections.mensalidade || "").trim(),
          modalidades: String(aiPlaybooksDraft.sections.modalidades || "").trim(),
          matricula: String(aiPlaybooksDraft.sections.matricula || "").trim(),
          objecoes: String(aiPlaybooksDraft.sections.objecoes || "").trim(),
        },
      });
      if (ok) toast.success("Playbooks da IA atualizados.");
    } finally {
      setSavingAiPlaybooks(false);
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

  const createPixPlanEntry = async () => {
    const name = String(pixPlanName || "").trim();
    const amountCents = parsePixAmountToCents(pixPlanAmount);
    if (!name) {
      toast.error("Informe o nome do plano.");
      return;
    }
    if (!amountCents) {
      toast.error("Informe um valor valido.");
      return;
    }
    setPixSaving(true);
    try {
      const ok = await createPixPlan({ name, amount_cents: amountCents, active: true });
      if (!ok) return;
      setPixPlanName("");
      setPixPlanAmount("");
      toast.success("Plano Pix cadastrado.");
    } finally {
      setPixSaving(false);
    }
  };

  const startPixEdit = (item: PixPlan) => {
    setPixEditingId(Number(item.id || 0));
    setPixEditingName(String(item.name || ""));
    setPixEditingAmount((Number(item.amount_cents || 0) / 100).toFixed(2).replace(".", ","));
  };

  const savePixEdit = async () => {
    if (!pixEditingId) return;
    const name = String(pixEditingName || "").trim();
    const amountCents = parsePixAmountToCents(pixEditingAmount);
    if (!name || !amountCents) {
      toast.error("Preencha nome e valor validos.");
      return;
    }
    setPixSaving(true);
    try {
      const ok = await updatePixPlan(pixEditingId, { name, amount_cents: amountCents });
      if (!ok) return;
      setPixEditingId(0);
      setPixEditingName("");
      setPixEditingAmount("");
      toast.success("Plano Pix atualizado.");
    } finally {
      setPixSaving(false);
    }
  };

  const disablePixPlan = async (id: number) => {
    if (!id) return;
    if (!window.confirm("Deseja desativar este plano Pix?")) return;
    setPixSaving(true);
    try {
      const ok = await deletePixPlan(id);
      if (!ok) return;
      if (pixEditingId === id) {
        setPixEditingId(0);
        setPixEditingName("");
        setPixEditingAmount("");
      }
      toast.success("Plano Pix desativado.");
    } finally {
      setPixSaving(false);
    }
  };

  const enablePixPlan = async (id: number) => {
    if (!id) return;
    setPixSaving(true);
    try {
      const ok = await updatePixPlan(id, { active: true });
      if (!ok) return;
      toast.success("Plano Pix reativado.");
    } finally {
      setPixSaving(false);
    }
  };

  const updatePixSafeDraftNumber = (key: keyof PixSafeConfig, rawValue: string) => {
    const value = Number(rawValue);
    setPixSafeDraft((prev) => ({
      ...prev,
      [key]: Number.isFinite(value) ? value : 0,
    }));
  };

  const handleSavePixSafe = async () => {
    if (!isAdmin || pixSafeSaving) return;
    setPixSafeSaving(true);
    try {
      const ok = await savePixSafeConfig({
        enabled: !!pixSafeDraft.enabled,
        requireOptIn: !!pixSafeDraft.requireOptIn,
        maxRemindersPerCharge: Number(pixSafeDraft.maxRemindersPerCharge || 0),
        firstReminderAfterMin: Number(pixSafeDraft.firstReminderAfterMin || 0),
        reminderIntervalMin: Number(pixSafeDraft.reminderIntervalMin || 0),
        quietHourStart: Number(pixSafeDraft.quietHourStart || 0),
        quietHourEnd: Number(pixSafeDraft.quietHourEnd || 0),
      });
      if (!ok) return;
      await loadPixSafeConfig();
    } finally {
      setPixSafeSaving(false);
    }
  };

  const handleUploadDailyImport = async () => {
    if (!dailyImportFile || dailyImportSending) return;
    setDailyImportSending(true);
    try {
      const ok = await uploadPixDailyImport(dailyImportFile);
      if (!ok) return;
      setDailyImportFile(null);
      await refreshPixDailyImports();
    } finally {
      setDailyImportSending(false);
    }
  };


  return (
    <div className="min-h-screen bg-neutral-50/50 dark:bg-neutral-950/50 p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50 mb-1 flex items-center gap-2">
            <Settings className="h-8 w-8 text-indigo-500" />
            Configurações do Sistema
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400">Gerencie regras, acessos e parâmetros da operação.</p>
        </div>
      </div>

      <Tabs defaultValue="ai" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="ai" className="gap-1">
            <Bot className="h-4 w-4" /> Contexto da IA
          </TabsTrigger>
          <TabsTrigger value="availability" className="gap-1">
            <CalendarClock className="h-4 w-4" /> Vagas disponíveis
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
            <TabsTrigger value="pix" className="gap-1">
              <CreditCard className="h-4 w-4" /> Pix
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
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4" /> Playbooks de resposta da IA
              </CardTitle>
              <CardDescription>
                Regras objetivas para melhorar respostas sobre mensalidade, modalidades, matricula e objecoes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Ativar playbooks</p>
                  <p className="text-xs text-muted-foreground">Quando ativo, a IA recebe estas orientacoes junto do contexto base.</p>
                </div>
                <Switch
                  checked={!!aiPlaybooksDraft.enabled}
                  onCheckedChange={(checked) => setAiPlaybooksDraft((prev) => ({ ...prev, enabled: checked }))}
                  disabled={!isAdmin}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mensalidade e preco</Label>
                  <Textarea
                    className="min-h-[120px]"
                    value={aiPlaybooksDraft.sections.mensalidade}
                    onChange={(event) => updatePlaybookField("mensalidade", event.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Modalidades e aulas</Label>
                  <Textarea
                    className="min-h-[120px]"
                    value={aiPlaybooksDraft.sections.modalidades}
                    onChange={(event) => updatePlaybookField("modalidades", event.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Matricula e fechamento</Label>
                  <Textarea
                    className="min-h-[120px]"
                    value={aiPlaybooksDraft.sections.matricula}
                    onChange={(event) => updatePlaybookField("matricula", event.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Objecoes comuns</Label>
                  <Textarea
                    className="min-h-[120px]"
                    value={aiPlaybooksDraft.sections.objecoes}
                    onChange={(event) => updatePlaybookField("objecoes", event.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {aiPlaybooks?.updated_at ? `Atualizado em ${formatDateTimeBr(aiPlaybooks.updated_at)} por ${aiPlaybooks?.updated_by || "admin"}.` : "Use este bloco para padronizar respostas comerciais da IA."}
                </p>
                <Button className="gap-1" onClick={handleSavePlaybooks} disabled={!isAdmin || savingAiPlaybooks}>
                  <Save className="h-4 w-4" /> {savingAiPlaybooks ? "Salvando..." : "Salvar playbooks"}
                </Button>
              </div>
            </CardContent>
          </Card>

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

        <TabsContent value="availability" className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-primary/5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarClock className="h-4 w-4 text-primary" /> Vagas por modalidade e turma
                  </CardTitle>
                  <CardDescription className="mt-1 max-w-2xl">
                    Informe aqui a quantidade exata disponível por modalidade, turma e horário. Esses números entram diretamente no contexto da Hime.
                  </CardDescription>
                </div>
                {availabilityUpdatedAt ? (
                  <Badge variant="outline" className="w-fit">
                    Atualizado em {formatDateTimeBr(availabilityUpdatedAt)}{availabilityUpdatedBy ? ` por ${availabilityUpdatedBy}` : ""}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {!isAdmin ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Você pode consultar as vagas, mas somente administradores podem alterá-las.
                </div>
              ) : null}

              <div className="rounded-2xl border bg-muted/20 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{availabilityForm.id ? "Editar registro" : "Nova informação de vaga"}</p>
                    <p className="text-xs text-muted-foreground">Use um registro separado para cada turma ou horário.</p>
                  </div>
                  {availabilityForm.id ? (
                    <Button variant="ghost" size="sm" onClick={() => setAvailabilityForm(EMPTY_AVAILABILITY_FORM)}>Cancelar edição</Button>
                  ) : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Modalidade *</Label>
                    <Input
                      value={availabilityForm.modality}
                      onChange={(event) => setAvailabilityForm((current) => ({ ...current, modality: event.target.value }))}
                      placeholder="Ex: Natação infantil"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Turma ou faixa etária</Label>
                    <Input
                      value={availabilityForm.className}
                      onChange={(event) => setAvailabilityForm((current) => ({ ...current, className: event.target.value }))}
                      placeholder="Ex: 7 a 14 anos"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dias e horário</Label>
                    <Input
                      value={availabilityForm.schedule}
                      onChange={(event) => setAvailabilityForm((current) => ({ ...current, schedule: event.target.value }))}
                      placeholder="Ex: Ter/Qui às 16:00"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={availabilityForm.status}
                      onValueChange={(value: ModalityAvailabilityEntry["status"]) => setAvailabilityForm((current) => ({ ...current, status: value }))}
                      disabled={!isAdmin}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Com vagas</SelectItem>
                        <SelectItem value="full">Lotada</SelectItem>
                        <SelectItem value="waitlist">Lista de espera</SelectItem>
                        <SelectItem value="unavailable">Indisponível</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Vagas disponíveis {availabilityForm.status === "available" ? "*" : ""}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={availabilityForm.availableSpots}
                      onChange={(event) => setAvailabilityForm((current) => ({ ...current, availableSpots: event.target.value }))}
                      placeholder="Ex: 3"
                      required={availabilityForm.status === "available"}
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Capacidade total</Label>
                    <Input
                      type="number"
                      min="1"
                      value={availabilityForm.capacity}
                      onChange={(event) => setAvailabilityForm((current) => ({ ...current, capacity: event.target.value }))}
                      placeholder="Opcional"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Válido até *</Label>
                    <Input
                      type="date"
                      value={availabilityForm.validUntil}
                      onChange={(event) => setAvailabilityForm((current) => ({ ...current, validUntil: event.target.value }))}
                      disabled={!isAdmin}
                    />
                    <p className="text-[11px] text-muted-foreground">Obrigatório para registros ativos. Depois da data, a IA ignora a vaga.</p>
                  </div>
                  <div className="flex items-end">
                    <div className="flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2.5">
                      <div>
                        <p className="text-xs font-medium">Registro ativo</p>
                        <p className="text-[10px] text-muted-foreground">Disponível para a IA</p>
                      </div>
                      <Switch
                        checked={availabilityForm.active}
                        onCheckedChange={(checked) => setAvailabilityForm((current) => ({ ...current, active: checked }))}
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2 xl:col-span-3">
                    <Label>Observação</Label>
                    <Input
                      value={availabilityForm.note}
                      onChange={(event) => setAvailabilityForm((current) => ({ ...current, note: event.target.value }))}
                      placeholder="Ex: matrícula somente presencial; confirmar antes de prometer"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full gap-2" onClick={upsertAvailabilityEntry} disabled={!isAdmin}>
                      {availabilityForm.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {availabilityForm.id ? "Atualizar na lista" : "Adicionar à lista"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Registros cadastrados</p>
                    <p className="text-xs text-muted-foreground">{availabilityEntries.length} {availabilityEntries.length === 1 ? "registro" : "registros"}</p>
                  </div>
                  <Button className="gap-2" onClick={saveAvailability} disabled={!isAdmin || savingAvailability || loadingAvailability}>
                    <Save className="h-4 w-4" /> {savingAvailability ? "Salvando..." : "Salvar vagas para a IA"}
                  </Button>
                </div>

                {loadingAvailability ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Carregando vagas...</div>
                ) : availabilityEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center">
                    <CalendarClock className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Nenhuma modalidade com vagas cadastrada</p>
                    <p className="mt-1 text-xs text-muted-foreground">Sem um registro vigente, a Hime orientará o cliente a confirmar com a recepção.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {availabilityEntries.map((entry) => {
                      const expired = !!entry.validUntil && entry.validUntil < Date.now();
                      const statusLabel = entry.status === "full" ? "Lotada" : entry.status === "waitlist" ? "Lista de espera" : entry.status === "unavailable" ? "Indisponível" : "Com vagas";
                      return (
                        <div key={entry.id} className={`rounded-2xl border p-4 ${expired || !entry.active ? "bg-muted/30 opacity-70" : "bg-card"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">{entry.modality}</p>
                                <Badge variant={entry.status === "full" || entry.status === "unavailable" ? "destructive" : entry.status === "waitlist" ? "secondary" : "default"}>{statusLabel}</Badge>
                                {expired ? <Badge variant="outline">Expirado</Badge> : null}
                                {!entry.active ? <Badge variant="outline">Inativo</Badge> : null}
                              </div>
                              {entry.className || entry.schedule ? <p className="mt-1 text-sm text-muted-foreground">{[entry.className, entry.schedule].filter(Boolean).join(" • ")}</p> : null}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editAvailabilityEntry(entry)} disabled={!isAdmin} title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setAvailabilityEntries((current) => current.filter((item) => item.id !== entry.id))} disabled={!isAdmin} title="Excluir">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {entry.availableSpots !== null ? <Badge variant="outline">{entry.availableSpots} {entry.availableSpots === 1 ? "vaga" : "vagas"}</Badge> : null}
                            {entry.capacity !== null ? <Badge variant="outline">Capacidade: {entry.capacity}</Badge> : null}
                            {entry.validUntil ? <Badge variant="outline">Válido até {availabilityDateInput(entry.validUntil).split("-").reverse().join("/")}</Badge> : <Badge variant="secondary">Sem validade</Badge>}
                          </div>
                          {entry.note ? <p className="mt-3 text-xs text-muted-foreground">{entry.note}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
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
          <TabsContent value="pix" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Planos para cobranca Pix
                </CardTitle>
                <CardDescription>
                  Cadastre os planos que o bot pode cobrar via Pix no WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
                  <Input
                    placeholder="Ex: Musculacao Mensal"
                    value={pixPlanName}
                    onChange={(event) => setPixPlanName(event.target.value)}
                    disabled={pixSaving}
                  />
                  <Input
                    placeholder="Ex: 129,90"
                    value={pixPlanAmount}
                    onChange={(event) => setPixPlanAmount(event.target.value)}
                    disabled={pixSaving}
                  />
                  <Button className="gap-1" onClick={createPixPlanEntry} disabled={pixSaving}>
                    <Save className="h-4 w-4" /> Adicionar
                  </Button>
                </div>

                <div className="space-y-2">
                  {(pixPlans || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum plano Pix cadastrado.</p>
                  ) : (
                    (pixPlans as PixPlan[]).map((item) => {
                      const isEditing = pixEditingId === Number(item.id || 0);
                      return (
                        <div key={item.id} className="rounded-lg border p-3 space-y-2">
                          {isEditing ? (
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto_auto] gap-2">
                              <Input value={pixEditingName} onChange={(event) => setPixEditingName(event.target.value)} disabled={pixSaving} />
                              <Input value={pixEditingAmount} onChange={(event) => setPixEditingAmount(event.target.value)} disabled={pixSaving} />
                              <Button size="sm" onClick={savePixEdit} disabled={pixSaving}>Salvar</Button>
                              <Button size="sm" variant="outline" onClick={() => setPixEditingId(0)} disabled={pixSaving}>Cancelar</Button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{item.name}</p>
                                <p className="text-xs text-muted-foreground">{(Number(item.amount_cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {Number(item.active || 0) === 1 ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                                <Button size="sm" variant="outline" onClick={() => startPixEdit(item)} disabled={pixSaving}>Editar</Button>
                                {Number(item.active || 0) === 1 ? (
                                  <Button size="sm" variant="outline" onClick={() => disablePixPlan(Number(item.id || 0))} disabled={pixSaving}>
                                    Desativar
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => enablePixPlan(Number(item.id || 0))} disabled={pixSaving}>
                                    Reativar
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Modo cobranca segura
                </CardTitle>
                <CardDescription>
                  Regras anti-spam para lembretes de Pix no WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Lembretes ativos</p>
                      <p className="text-xs text-muted-foreground">Ativa envio automatico de lembretes para cobrancas pendentes.</p>
                    </div>
                    <Switch
                      checked={!!pixSafeDraft.enabled}
                      onCheckedChange={(checked) => setPixSafeDraft((prev) => ({ ...prev, enabled: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Exigir opt-in</p>
                      <p className="text-xs text-muted-foreground">So envia lembrete para quem ja pediu cobranca via chat.</p>
                    </div>
                    <Switch
                      checked={!!pixSafeDraft.requireOptIn}
                      onCheckedChange={(checked) => setPixSafeDraft((prev) => ({ ...prev, requireOptIn: checked }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Max lembretes por cobranca</Label>
                    <Input type="number" value={pixSafeDraft.maxRemindersPerCharge} onChange={(event) => updatePixSafeDraftNumber("maxRemindersPerCharge", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>1o lembrete apos (min)</Label>
                    <Input type="number" value={pixSafeDraft.firstReminderAfterMin} onChange={(event) => updatePixSafeDraftNumber("firstReminderAfterMin", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Intervalo entre lembretes (min)</Label>
                    <Input type="number" value={pixSafeDraft.reminderIntervalMin} onChange={(event) => updatePixSafeDraftNumber("reminderIntervalMin", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Janela inicio (hora)</Label>
                    <Input type="number" value={pixSafeDraft.quietHourStart} onChange={(event) => updatePixSafeDraftNumber("quietHourStart", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Janela fim (hora)</Label>
                    <Input type="number" value={pixSafeDraft.quietHourEnd} onChange={(event) => updatePixSafeDraftNumber("quietHourEnd", event.target.value)} />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button className="gap-1" onClick={handleSavePixSafe} disabled={pixSafeSaving}>
                    <Save className="h-4 w-4" /> Salvar modo seguro
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
