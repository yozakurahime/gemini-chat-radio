import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  Download,
  Calendar,
  User,
  CheckCircle,
  XCircle,
  ListChecks,
  MapPin,
  Plus,
  Trash2,
  Pencil,
  LogIn,
  LogOut,
  FileWarning,
  TimerReset,
  ChevronRight,
  ShieldCheck,
  Settings2,
  CalendarClock,
  Check,
  X
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePanelData } from "@/hooks/use-panel-data";
import { apiFetch, jsonHeaders } from "@/lib/panel-api";
import { formatDateBr as formatDateBrTz } from "@/lib/date-time";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const MAIN_VIEWS = ["today", "schedules", "team", "setup"] as const;
type MainView = (typeof MAIN_VIEWS)[number];
type TodayView = "overview" | "history" | "map";

function attendanceErrorMessage(code: string) {
  switch (code) {
    case "not_teacher_for_class":
      return "Esse funcionario nao pode receber escala de aula. Selecione Funcao ou ajuste o cargo.";
    case "invalid_activity":
      return "Atividade invalida. Atualize o catalogo e tente novamente.";
    case "activity_type_mismatch":
      return "A atividade escolhida nao combina com o tipo da escala.";
    case "invalid_time":
      return "Horario invalido. Confira inicio e fim.";
    case "invalid_employee":
      return "Funcionario invalido ou inativo.";
    case "invalid_weekday":
      return "Dia da semana invalido.";
    default:
      return "Falha ao salvar escala.";
  }
}

function manualPunchErrorMessage(code: string) {
  switch (code) {
    case "invalid_employee":
      return "Selecione um funcionario valido.";
    case "invalid_event":
      return "Tipo de registro invalido.";
    case "employee_not_allowed":
      return "Esse funcionario nao esta habilitado para ponto.";
    case "outside_schedule":
    case "invalid_punch_window":
      return "Registro fora da janela permitida da escala.";
    case "already_closed":
      return "Nao existe turno aberto para registrar saida.";
    default:
      return "Nao foi possivel registrar o ponto manual agora.";
  }
}

function formatDateBr(value?: string) {
  return formatDateBrTz(value ? `${value}T00:00:00` : undefined, value || "-");
}

function scheduleTypeLabel(value?: string) {
  if (value === "class") return "Aula";
  return "Funcao";
}

function buildMapEmbedUrl(lat: number, lng: number) {
  const delta = 0.004;
  const left = lng - delta;
  const bottom = lat - delta;
  const right = lng + delta;
  const top = lat + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function resolvePeriod(fromRaw?: string, toRaw?: string) {
  let from = String(fromRaw || "").slice(0, 10);
  let to = String(toRaw || "").slice(0, 10);
  if (!from && !to) {
    to = new Date().toISOString().slice(0, 10);
    from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  } else if (from && !to) {
    to = from;
  } else if (!from && to) {
    from = to;
  }
  if (from > to) {
    return { from: to, to: from };
  }
  return { from, to };
}

function toNumberOrNull(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateKeyFromLocalDate(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseHHMMToMinutes(value?: string) {
  const text = String(value || "").trim();
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return (hh * 60) + mm;
}

type EditScheduleState = {
  id: number;
  weekday: string;
  startTime: string;
  endTime: string;
  scheduleType: "class" | "function";
  activityId: string;
  toleranceMin: string;
  valuePerClass: string;
};

type EditCatalogState = {
  id: number;
  type: "class" | "function";
  name: string;
  defaultValue: string;
  sortOrder: string;
};

type EditTemplateState = {
  id: number;
  activityId: string;
  weekday: string;
  startTime: string;
  endTime: string;
};

type EditEmployeeState = {
  id: number;
  name: string;
  phone: string;
  roleActivityId: string;
  notes: string;
  active: boolean;
};

export default function PontoPage() {
  const {
    user,
    attendanceEmployees,
    attendanceCatalog,
    attendanceTemplates,
    attendanceSchedules,
    attendanceRecords,
    attendanceSummary,
    attendanceSelectedEmployee,
    attendanceFromDate,
    attendanceToDate,
    setAttendanceSelectedEmployee,
    setAttendanceFromDate,
    setAttendanceToDate,
    createAttendanceEmployee,
    updateAttendanceEmployee,
    deleteAttendanceEmployee,
    createAttendanceCatalogItem,
    updateAttendanceCatalogItem,
    deleteAttendanceCatalogItem,
    createAttendanceTemplate,
    updateAttendanceTemplate,
    deleteAttendanceTemplate,
    applyEmployeeTemplates,
    updateAttendanceSchedule,
    refreshAttendance,
  } = usePanelData();

  const isAdmin = user?.role === "admin";
  const todayKey = useMemo(() => dateKeyFromLocalDate(new Date()), []);
  const todayWeekday = useMemo(() => new Date().getDay(), []);
  const nowMinutes = useMemo(() => {
    const now = new Date();
    return (now.getHours() * 60) + now.getMinutes();
  }, [attendanceRecords, attendanceSchedules]);

  const activeAttendanceEmployees = useMemo(
    () => attendanceEmployees.filter((employee) => Number(employee.active ?? 1) === 1),
    [attendanceEmployees],
  );

  const employeeOptions = useMemo(() => ([
    { id: "Todos", label: "Todos" },
    ...activeAttendanceEmployees.map((employee) => ({
      id: String(employee.id),
      label: employee.name || `Funcionario ${employee.id}`,
    })),
  ]), [activeAttendanceEmployees]);

  const selectedEmployeeValue = employeeOptions.some((item) => item.id === attendanceSelectedEmployee)
    ? attendanceSelectedEmployee
    : "Todos";

  const filteredRecords = useMemo(() => attendanceRecords.filter((record) => {
    if (selectedEmployeeValue !== "Todos" && String(record.employeeId || "") !== String(selectedEmployeeValue)) return false;
    return true;
  }), [attendanceRecords, selectedEmployeeValue]);

  const filteredSchedules = useMemo(() => attendanceSchedules.filter((schedule) => {
    if (selectedEmployeeValue === "Todos") return true;
    return String(schedule.employee_id || "") === String(selectedEmployeeValue);
  }), [attendanceSchedules, selectedEmployeeValue]);

  const reportLinks = useMemo(() => {
    const selected = selectedEmployeeValue === "Todos"
      ? activeAttendanceEmployees[0]
      : activeAttendanceEmployees.find((employee) => String(employee.id) === String(selectedEmployeeValue));
    if (!selected) return { csv: "#", html: "#" };
    const { from, to } = resolvePeriod(attendanceFromDate, attendanceToDate);
    const query = new URLSearchParams({
      from,
      to,
      employeeId: String(selected.id),
    }).toString();
    return {
      csv: `/admin/attendance/export.csv?${query}`,
      html: `/admin/attendance/export.html?${query}`,
    };
  }, [activeAttendanceEmployees, attendanceFromDate, attendanceToDate, selectedEmployeeValue]);

  const geoRecords = useMemo(() => (
    filteredRecords.filter((record) => Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lng)) && !(Number(record.lat) === 0 && Number(record.lng) === 0))
  ), [filteredRecords]);

  const todayRecords = useMemo(
    () => filteredRecords.filter((record) => String(record.date || "") === todayKey),
    [filteredRecords, todayKey],
  );

  const todaySchedules = useMemo(
    () => filteredSchedules.filter((schedule) => Number(schedule.weekday) === Number(todayWeekday)),
    [filteredSchedules, todayWeekday],
  );

  const todayRecordByEmployee = useMemo(() => {
    const map = new Map<string, { entries: number; exits: number }>();
    todayRecords.forEach((record) => {
      const key = String(record.employeeId || "");
      if (!key) return;
      const current = map.get(key) || { entries: 0, exits: 0 };
      if (record.type === "entrada") current.entries += 1;
      if (record.type === "saida") current.exits += 1;
      map.set(key, current);
    });
    return map;
  }, [todayRecords]);

  const todayStats = useMemo(() => {
    const scheduledEmployeeIds = Array.from(new Set(todaySchedules.map((schedule) => String(schedule.employee_id || "")).filter(Boolean)));
    const entryEmployeeIds = new Set(todayRecords.filter((record) => record.type === "entrada").map((record) => String(record.employeeId || "")));
    const absentEmployeeIds = scheduledEmployeeIds.filter((employeeId) => !entryEmployeeIds.has(employeeId));
    const lateEmployeeIds = todaySchedules
      .filter((schedule) => {
        const employeeId = String(schedule.employee_id || "");
        if (!employeeId || entryEmployeeIds.has(employeeId)) return false;
        const start = parseHHMMToMinutes(schedule.start_time);
        const tolerance = Number(schedule.tolerance_min || 0);
        if (start === null) return false;
        return nowMinutes > (start + Math.max(0, tolerance));
      })
      .map((schedule) => String(schedule.employee_id || ""));
    const openShiftEmployeeIds = Array.from(todayRecordByEmployee.entries())
      .filter(([, counts]) => counts.entries > counts.exits)
      .map(([employeeId]) => employeeId);
    return {
      scheduledEmployeeIds,
      absentEmployeeIds,
      lateEmployeeIds: Array.from(new Set(lateEmployeeIds)),
      openShiftEmployeeIds,
      entries: todayRecords.filter((record) => record.type === "entrada").length,
      exits: todayRecords.filter((record) => record.type === "saida").length,
    };
  }, [nowMinutes, todayRecordByEmployee, todayRecords, todaySchedules]);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    attendanceEmployees.forEach((employee) => {
      map.set(String(employee.id), employee.name || `Funcionario ${employee.id}`);
    });
    return map;
  }, [attendanceEmployees]);

  const [selectedMapRecordId, setSelectedMapRecordId] = useState<string>("");
  const [mainView, setMainView] = useState<MainView>("today");
  const [todayView, setTodayView] = useState<TodayView>("overview");
  const [wizardStep, setWizardStep] = useState(0);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [quickEmployeeId, setQuickEmployeeId] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [justificationReason, setJustificationReason] = useState("");
  const [justificationDate, setJustificationDate] = useState(todayKey);
  const [sendingManualPunch, setSendingManualPunch] = useState(false);
  const [sendingJustification, setSendingJustification] = useState(false);

  useEffect(() => {
    if (!isAdmin && mainView !== "today") {
      setMainView("today");
    }
  }, [isAdmin, mainView]);

  useEffect(() => {
    if (!geoRecords.length) {
      setSelectedMapRecordId("");
      return;
    }
    if (!geoRecords.some((record) => String(record.id) === String(selectedMapRecordId))) {
      setSelectedMapRecordId(String(geoRecords[0].id));
    }
  }, [geoRecords, selectedMapRecordId]);

  const selectedMapRecord = useMemo(
    () => geoRecords.find((record) => String(record.id) === String(selectedMapRecordId)) || null,
    [geoRecords, selectedMapRecordId],
  );

  const classActivities = useMemo(
    () => attendanceCatalog.filter((item) => String(item.type || "").toLowerCase() === "class" && Number(item.active || 0) === 1),
    [attendanceCatalog],
  );
  const functionActivities = useMemo(
    () => attendanceCatalog.filter((item) => String(item.type || "").toLowerCase() === "function" && Number(item.active || 0) === 1),
    [attendanceCatalog],
  );

  const [scheduleType, setScheduleType] = useState<"function" | "class">("function");
  const scheduleActivityOptions = scheduleType === "class" ? classActivities : functionActivities;

  const defaultEmployeeId = useMemo(
    () => String(activeAttendanceEmployees[0]?.id || ""),
    [activeAttendanceEmployees],
  );
  const defaultRoleActivityId = useMemo(
    () => String(functionActivities[0]?.id || ""),
    [functionActivities],
  );

  const [employeeForm, setEmployeeForm] = useState({
    name: "",
    phone: "",
    roleActivityId: "",
    notes: "",
  });
  const [newSchedule, setNewSchedule] = useState({
    employeeId: "",
    weekday: "1",
    startTime: "08:00",
    endTime: "12:00",
    activityId: "",
    toleranceMin: "5",
    valuePerClass: "0",
  });

  const [catalogForm, setCatalogForm] = useState({
    type: "class" as "class" | "function",
    name: "",
    defaultValue: "20",
    sortOrder: "900",
  });
  const [editingCatalog, setEditingCatalog] = useState<EditCatalogState | null>(null);

  const [templateForm, setTemplateForm] = useState({
    activityId: "",
    weekday: "1",
    startTime: "08:00",
    endTime: "09:00",
  });
  const [editingTemplate, setEditingTemplate] = useState<EditTemplateState | null>(null);

  const [applyEmployeeId, setApplyEmployeeId] = useState("");
  const [replaceTemplateSchedules, setReplaceTemplateSchedules] = useState(false);
  const [applyToleranceMin, setApplyToleranceMin] = useState("5");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);

  const [editingSchedule, setEditingSchedule] = useState<EditScheduleState | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<EditEmployeeState | null>(null);
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);

  useEffect(() => {
    if (!quickEmployeeId && defaultEmployeeId) {
      setQuickEmployeeId(defaultEmployeeId);
    }
    if (!newSchedule.employeeId && defaultEmployeeId) {
      setNewSchedule((prev) => ({ ...prev, employeeId: defaultEmployeeId }));
    }
    if (!applyEmployeeId && defaultEmployeeId) {
      setApplyEmployeeId(defaultEmployeeId);
    }
  }, [applyEmployeeId, defaultEmployeeId, newSchedule.employeeId, quickEmployeeId]);

  useEffect(() => {
    if (!employeeForm.roleActivityId && defaultRoleActivityId) {
      setEmployeeForm((prev) => ({ ...prev, roleActivityId: defaultRoleActivityId }));
    }
  }, [defaultRoleActivityId, employeeForm.roleActivityId]);

  useEffect(() => {
    if (!scheduleActivityOptions.length) {
      setNewSchedule((prev) => ({ ...prev, activityId: "" }));
      return;
    }
    if (!scheduleActivityOptions.some((item) => String(item.id) === String(newSchedule.activityId))) {
      const first = scheduleActivityOptions[0];
      setNewSchedule((prev) => ({
        ...prev,
        activityId: String(first.id),
        valuePerClass: scheduleType === "class" ? String(Number(first.default_value || 0)) : prev.valuePerClass,
      }));
    }
  }, [newSchedule.activityId, scheduleActivityOptions, scheduleType]);

  useEffect(() => {
    if (!templateForm.activityId && classActivities.length) {
      setTemplateForm((prev) => ({ ...prev, activityId: String(classActivities[0].id) }));
    }
  }, [classActivities, templateForm.activityId]);

  const submitEmployeeForm = async () => {
    const ok = await createAttendanceEmployee({
      name: employeeForm.name.trim(),
      phone: employeeForm.phone.trim(),
      roleActivityId: Number(employeeForm.roleActivityId),
      notes: employeeForm.notes.trim(),
    });
    if (!ok) return;
    setEmployeeForm({
      name: "",
      phone: "",
      roleActivityId: defaultRoleActivityId,
      notes: "",
    });
  };

  const resolveEmployeeRoleActivityId = (role?: string) => {
    const normalized = String(role || "").trim().toLowerCase();
    const match = functionActivities.find((item) => String(item.name || "").trim().toLowerCase() === normalized);
    return String(match?.id || defaultRoleActivityId || "");
  };

  const openEmployeeEdit = (employee: any) => {
    setEditingEmployee({
      id: Number(employee.id),
      name: String(employee.name || ""),
      phone: String(employee.whatsapp_phone || ""),
      roleActivityId: resolveEmployeeRoleActivityId(employee.role),
      notes: String(employee.notes || ""),
      active: Number(employee.active ?? 1) === 1,
    });
  };

  const saveEmployeeEdit = async () => {
    if (!editingEmployee) return;
    const ok = await updateAttendanceEmployee(editingEmployee.id, {
      name: editingEmployee.name.trim(),
      phone: editingEmployee.phone.trim(),
      roleActivityId: Number(editingEmployee.roleActivityId),
      notes: editingEmployee.notes.trim(),
      active: editingEmployee.active,
    });
    if (ok) setEditingEmployee(null);
  };

  const removeEmployee = async (employee: any) => {
    const employeeId = Number(employee.id);
    if (!Number.isFinite(employeeId)) return;
    if (!window.confirm(`Remover ${employee.name || "este funcionario"} do ponto? O historico sera mantido.`)) return;
    const ok = await deleteAttendanceEmployee(employeeId);
    if (ok && editingEmployee?.id === employeeId) setEditingEmployee(null);
  };

  const createSchedule = async () => {
    try {
      const rawValue = toNumberOrNull(newSchedule.valuePerClass);
      const payload = {
        employeeId: Number(newSchedule.employeeId),
        weekday: Number(newSchedule.weekday),
        startTime: newSchedule.startTime,
        endTime: newSchedule.endTime,
        scheduleType,
        activityId: Number(newSchedule.activityId),
        toleranceMin: Number(newSchedule.toleranceMin),
        valuePerClass: scheduleType === "class" ? rawValue : 0,
      };
      await apiFetch("/admin/attendance/schedules", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      toast.success("Escala criada");
      setIsCreatingSchedule(false);
      await refreshAttendance();
    } catch (error: any) {
      const code = String(error?.code || "");
      toast.error(attendanceErrorMessage(code));
    }
  };

  const deactivateSchedule = async (id: number) => {
    try {
      await apiFetch(`/admin/attendance/schedules/${id}`, { method: "DELETE" });
      toast.success("Escala desativada");
      await refreshAttendance();
      if (editingSchedule?.id === id) setEditingSchedule(null);
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "not_found") {
        toast.error("Escala nao encontrada.");
        return;
      }
      toast.error("Falha ao remover escala.");
    }
  };

  const submitCatalogForm = async () => {
    const ok = await createAttendanceCatalogItem({
      type: catalogForm.type,
      name: catalogForm.name,
      defaultValue: Number(catalogForm.defaultValue || 0),
      sortOrder: Number(catalogForm.sortOrder || 0),
    });
    if (!ok) return;
    setCatalogForm({ type: "class", name: "", defaultValue: "20", sortOrder: "900" });
  };

  const saveCatalogEdit = async () => {
    if (!editingCatalog) return;
    const ok = await updateAttendanceCatalogItem(editingCatalog.id, {
      type: editingCatalog.type,
      name: editingCatalog.name,
      defaultValue: Number(editingCatalog.defaultValue || 0),
      sortOrder: Number(editingCatalog.sortOrder || 0),
    });
    if (ok) setEditingCatalog(null);
  };

  const submitTemplateForm = async () => {
    const ok = await createAttendanceTemplate({
      activityId: Number(templateForm.activityId),
      weekday: Number(templateForm.weekday),
      startTime: templateForm.startTime,
      endTime: templateForm.endTime,
    });
    if (!ok) return;
    setTemplateForm((prev) => ({ ...prev, startTime: "08:00", endTime: "09:00" }));
  };

  const saveTemplateEdit = async () => {
    if (!editingTemplate) return;
    const ok = await updateAttendanceTemplate(editingTemplate.id, {
      activityId: Number(editingTemplate.activityId),
      weekday: Number(editingTemplate.weekday),
      startTime: editingTemplate.startTime,
      endTime: editingTemplate.endTime,
    });
    if (ok) setEditingTemplate(null);
  };

  const toggleTemplateSelection = (id: string) => {
    setSelectedTemplateIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const applyTemplates = async () => {
    const ids = selectedTemplateIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (!ids.length && !replaceTemplateSchedules) {
      toast.error("Selecione ao menos um modelo ou marque substituir para limpar os modelos atuais.");
      return;
    }
    const ok = await applyEmployeeTemplates({
      employeeId: Number(applyEmployeeId),
      templateIds: ids,
      replace: replaceTemplateSchedules,
      toleranceMin: Number(applyToleranceMin || 5),
    });
    if (ok) setSelectedTemplateIds([]);
  };

  const openScheduleEdit = (schedule: any) => {
    setEditingSchedule({
      id: Number(schedule.id),
      weekday: String(schedule.weekday ?? "1"),
      startTime: String(schedule.start_time || "08:00"),
      endTime: String(schedule.end_time || "12:00"),
      scheduleType: String(schedule.schedule_type || "function").toLowerCase() === "class" ? "class" : "function",
      activityId: String(schedule.activity_id || ""),
      toleranceMin: String(schedule.tolerance_min ?? 5),
      valuePerClass: String(Number(schedule.value_per_class || 0)),
    });
  };

  const saveScheduleEdit = async () => {
    if (!editingSchedule) return;
    const rawValue = toNumberOrNull(editingSchedule.valuePerClass);
    const ok = await updateAttendanceSchedule(editingSchedule.id, {
      weekday: Number(editingSchedule.weekday),
      startTime: editingSchedule.startTime,
      endTime: editingSchedule.endTime,
      scheduleType: editingSchedule.scheduleType,
      activityId: Number(editingSchedule.activityId),
      toleranceMin: Number(editingSchedule.toleranceMin || 5),
      valuePerClass: editingSchedule.scheduleType === "class" ? rawValue : 0,
    });
    if (ok) setEditingSchedule(null);
  };

  const handleManualPunch = async (eventType: "entry" | "exit") => {
    if (!quickEmployeeId) {
      toast.error("Selecione um funcionario.");
      return;
    }
    setSendingManualPunch(true);
    try {
      await apiFetch("/admin/attendance/punch/manual", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          employeeId: Number(quickEmployeeId),
          eventType,
          note: quickNote.trim(),
        }),
      });
      toast.success(eventType === "entry" ? "Entrada registrada." : "Saida registrada.");
      setQuickNote("");
      await refreshAttendance();
    } catch (error: any) {
      toast.error(manualPunchErrorMessage(String(error?.code || "")));
    } finally {
      setSendingManualPunch(false);
    }
  };

  const handleCreateJustification = async () => {
    if (!quickEmployeeId) {
      toast.error("Selecione um funcionario.");
      return;
    }
    if (justificationReason.trim().length < 5) {
      toast.error("Descreva a justificativa com pelo menos 5 caracteres.");
      return;
    }
    setSendingJustification(true);
    try {
      await apiFetch("/admin/attendance/justifications", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          employeeId: Number(quickEmployeeId),
          date: justificationDate,
          reason: justificationReason.trim(),
          status: "approved_manual",
        }),
      });
      toast.success("Justificativa registrada.");
      setJustificationReason("");
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "invalid_payload") {
        toast.error("Dados invalidos da justificativa.");
      } else {
        toast.error("Nao foi possivel salvar a justificativa.");
      }
    } finally {
      setSendingJustification(false);
    }
  };

  const wizardProgress = useMemo(() => ((wizardStep + 1) / 4) * 100, [wizardStep]);
  const wizardReady = useMemo(() => ({
    employees: activeAttendanceEmployees.length > 0,
    catalog: attendanceCatalog.length > 0 && classActivities.length > 0 && functionActivities.length > 0,
    templates: attendanceTemplates.length > 0,
    schedules: attendanceSchedules.length > 0,
  }), [activeAttendanceEmployees.length, attendanceCatalog.length, attendanceSchedules.length, attendanceTemplates.length, classActivities.length, functionActivities.length]);

  const canGoToStep = (step: number) => {
    if (step <= 0) return true;
    if (step === 1) return wizardReady.employees;
    if (step === 2) return wizardReady.employees && wizardReady.catalog && wizardReady.templates;
    if (step === 3) return wizardReady.employees && wizardReady.catalog && wizardReady.templates;
    return true;
  };

  const renderRecordsFilters = (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Select value={selectedEmployeeValue} onValueChange={setAttendanceSelectedEmployee}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {employeeOptions.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>{employee.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">De</div>
            <Input
              type="date"
              value={attendanceFromDate}
              onChange={(event) => setAttendanceFromDate(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Ate</div>
            <Input
              type="date"
              value={attendanceToDate}
              onChange={(event) => setAttendanceToDate(event.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            className="md:justify-self-start xl:justify-self-end"
            onClick={() => {
              setAttendanceSelectedEmployee("Todos");
              setAttendanceFromDate("");
              setAttendanceToDate("");
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderRecordsTable = (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionario</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Localizacao</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRecords.length ? filteredRecords.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.employee || "-"}</TableCell>
                <TableCell>
                  <Badge variant={record.type === "entrada" ? "default" : "secondary"}>
                    {record.type === "entrada" ? "Entrada" : "Saida"}
                  </Badge>
                </TableCell>
                <TableCell>{formatDateBr(record.date)}</TableCell>
                <TableCell className="font-mono">{record.time || "--:--"}</TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {record.lat ? Number(record.lat).toFixed(4) : "--"}, {record.lng ? Number(record.lng).toFixed(4) : "--"}
                  </span>
                </TableCell>
                <TableCell>
                  {record.withinRadius ? (
                    <div className="flex items-center gap-1 text-primary">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-xs">No raio</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-destructive">
                      <XCircle className="h-4 w-4" />
                      <span className="text-xs">Fora do raio</span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum registro encontrado para este filtro.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderMap = (
    <TabsContent value="map" className="space-y-4">
      {selectedMapRecord ? (
        <>
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <Select value={String(selectedMapRecord.id)} onValueChange={setSelectedMapRecordId}>
                <SelectTrigger className="w-full md:w-[28rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {geoRecords.map((record) => (
                    <SelectItem key={record.id} value={String(record.id)}>
                      {`${record.employee || "Funcionario"} - ${formatDateBr(record.date)} ${record.time || "--:--"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" asChild>
                <a
                  href={`https://www.google.com/maps?q=${selectedMapRecord.lat},${selectedMapRecord.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir no Google Maps
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <iframe
                title="Mapa de localizacao"
                src={buildMapEmbedUrl(Number(selectedMapRecord.lat), Number(selectedMapRecord.lng))}
                className="w-full h-[28rem] border-0"
                loading="lazy"
              />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              Nenhum registro com coordenadas para exibir no mapa.
            </div>
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );

  const renderEmployeesSection = (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastrar funcionario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <Input
              value={employeeForm.name}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Nome"
            />
            <Input
              value={employeeForm.phone}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="WhatsApp com DDD"
            />
            <Select
              value={employeeForm.roleActivityId || defaultRoleActivityId}
              onValueChange={(value) => setEmployeeForm((prev) => ({ ...prev, roleActivityId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Funcao" />
              </SelectTrigger>
              <SelectContent>
                {functionActivities.map((activity) => (
                  <SelectItem key={activity.id} value={String(activity.id)}>
                    {activity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={employeeForm.notes}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Observacoes"
            />
            <Button
              onClick={submitEmployeeForm}
              className="gap-1"
              disabled={!employeeForm.name.trim() || !employeeForm.phone.trim() || !(employeeForm.roleActivityId || defaultRoleActivityId)}
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funcionarios do ponto</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Funcao</TableHead>
                <TableHead>Escalas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attendanceEmployees.length ? attendanceEmployees.map((employee) => {
                const editing = editingEmployee?.id === Number(employee.id);
                return (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      {editing ? (
                        <Input
                          value={editingEmployee?.name || ""}
                          onChange={(event) => setEditingEmployee((prev) => prev ? { ...prev, name: event.target.value } : prev)}
                        />
                      ) : (employee.name || `Funcionario ${employee.id}`)}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <Input
                          value={editingEmployee?.phone || ""}
                          onChange={(event) => setEditingEmployee((prev) => prev ? { ...prev, phone: event.target.value } : prev)}
                        />
                      ) : (employee.whatsapp_phone || "-")}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <Select
                          value={editingEmployee?.roleActivityId || defaultRoleActivityId}
                          onValueChange={(value) => setEditingEmployee((prev) => prev ? { ...prev, roleActivityId: value } : prev)}
                        >
                          <SelectTrigger><SelectValue placeholder="Funcao" /></SelectTrigger>
                          <SelectContent>
                            {functionActivities.map((activity) => (
                              <SelectItem key={activity.id} value={String(activity.id)}>
                                {activity.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (employee.role || "-")}
                    </TableCell>
                    <TableCell>{Number(employee.schedules_count || 0)}</TableCell>
                    <TableCell>
                      {editing ? (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!editingEmployee?.active}
                            onChange={(event) => setEditingEmployee((prev) => prev ? { ...prev, active: event.target.checked } : prev)}
                          />
                          Ativo
                        </label>
                      ) : (
                        <Badge variant={Number(employee.active ?? 1) === 1 ? "default" : "secondary"}>
                          {Number(employee.active ?? 1) === 1 ? "Ativo" : "Inativo"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={saveEmployeeEdit}>Salvar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingEmployee(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" aria-label={`Editar ${employee.name || "funcionario"}`} onClick={() => openEmployeeEdit(employee)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label={`Remover ${employee.name || "funcionario"}`} onClick={() => removeEmployee(employee)} disabled={Number(employee.active ?? 1) !== 1}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum funcionario cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderCatalogSection = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Catalogo de Aulas e Funcoes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAdmin ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <Select value={catalogForm.type} onValueChange={(value: "class" | "function") => setCatalogForm((prev) => ({ ...prev, type: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="class">Aula</SelectItem>
                <SelectItem value="function">Funcao</SelectItem>
              </SelectContent>
            </Select>
            <Input value={catalogForm.name} onChange={(event) => setCatalogForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nome da atividade" />
            <Input type="number" min={0} step="0.01" value={catalogForm.defaultValue} onChange={(event) => setCatalogForm((prev) => ({ ...prev, defaultValue: event.target.value }))} placeholder="Valor padrao" />
            <Input type="number" value={catalogForm.sortOrder} onChange={(event) => setCatalogForm((prev) => ({ ...prev, sortOrder: event.target.value }))} placeholder="Ordem" />
            <Button onClick={submitCatalogForm} disabled={!catalogForm.name.trim()}>Cadastrar</Button>
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Valor padrao</TableHead>
              <TableHead>Ordem</TableHead>
              {isAdmin ? <TableHead>Acoes</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {attendanceCatalog.length ? attendanceCatalog.map((item) => {
              const editing = editingCatalog?.id === Number(item.id);
              return (
                <TableRow key={item.id}>
                  <TableCell>{editing ? (
                    <Select value={editingCatalog?.type || "class"} onValueChange={(value: "class" | "function") => setEditingCatalog((prev) => prev ? { ...prev, type: value } : prev)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="class">Aula</SelectItem>
                        <SelectItem value="function">Funcao</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : scheduleTypeLabel(item.type)}</TableCell>
                  <TableCell>{editing ? <Input value={editingCatalog?.name || ""} onChange={(event) => setEditingCatalog((prev) => prev ? { ...prev, name: event.target.value } : prev)} /> : (item.name || "-")}</TableCell>
                  <TableCell>{editing ? <Input type="number" min={0} step="0.01" value={editingCatalog?.defaultValue || "0"} onChange={(event) => setEditingCatalog((prev) => prev ? { ...prev, defaultValue: event.target.value } : prev)} /> : Number(item.default_value || 0).toFixed(2)}</TableCell>
                  <TableCell>{editing ? <Input type="number" value={editingCatalog?.sortOrder || "0"} onChange={(event) => setEditingCatalog((prev) => prev ? { ...prev, sortOrder: event.target.value } : prev)} /> : Number(item.sort_order || 0)}</TableCell>
                  {isAdmin ? (
                    <TableCell>
                      {editing ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveCatalogEdit}>Salvar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingCatalog(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => setEditingCatalog({ id: Number(item.id), type: String(item.type || "class").toLowerCase() === "function" ? "function" : "class", name: String(item.name || ""), defaultValue: String(Number(item.default_value || 0)), sortOrder: String(Number(item.sort_order || 0)) })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteAttendanceCatalogItem(Number(item.id))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">Nenhuma atividade cadastrada.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderTemplatesSection = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Modelos de Escala</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAdmin ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <Select value={templateForm.activityId} onValueChange={(value) => setTemplateForm((prev) => ({ ...prev, activityId: value }))}>
              <SelectTrigger><SelectValue placeholder="Aula" /></SelectTrigger>
              <SelectContent>
                {classActivities.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={templateForm.weekday} onValueChange={(value) => setTemplateForm((prev) => ({ ...prev, weekday: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((label, idx) => (
                  <SelectItem key={label} value={String(idx)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="time" value={templateForm.startTime} onChange={(event) => setTemplateForm((prev) => ({ ...prev, startTime: event.target.value }))} />
            <Input type="time" value={templateForm.endTime} onChange={(event) => setTemplateForm((prev) => ({ ...prev, endTime: event.target.value }))} />
            <Button onClick={submitTemplateForm} disabled={!templateForm.activityId}>Criar modelo</Button>
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aula</TableHead>
              <TableHead>Dia</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Fim</TableHead>
              {isAdmin ? <TableHead>Acoes</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {attendanceTemplates.length ? attendanceTemplates.map((template) => {
              const editing = editingTemplate?.id === Number(template.id);
              return (
                <TableRow key={template.id}>
                  <TableCell>{editing ? (
                    <Select value={editingTemplate?.activityId || ""} onValueChange={(value) => setEditingTemplate((prev) => prev ? { ...prev, activityId: value } : prev)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {classActivities.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (template.activity_label || template.catalog_name || "Aula")}</TableCell>
                  <TableCell>{editing ? (
                    <Select value={editingTemplate?.weekday || "1"} onValueChange={(value) => setEditingTemplate((prev) => prev ? { ...prev, weekday: value } : prev)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_LABELS.map((label, idx) => (
                          <SelectItem key={label} value={String(idx)}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : WEEKDAY_LABELS[Number(template.weekday) || 0]}</TableCell>
                  <TableCell>{editing ? <Input type="time" value={editingTemplate?.startTime || ""} onChange={(event) => setEditingTemplate((prev) => prev ? { ...prev, startTime: event.target.value } : prev)} /> : (template.start_time || "--:--")}</TableCell>
                  <TableCell>{editing ? <Input type="time" value={editingTemplate?.endTime || ""} onChange={(event) => setEditingTemplate((prev) => prev ? { ...prev, endTime: event.target.value } : prev)} /> : (template.end_time || "--:--")}</TableCell>
                  {isAdmin ? (
                    <TableCell>
                      {editing ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveTemplateEdit}>Salvar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => setEditingTemplate({ id: Number(template.id), activityId: String(template.activity_id || ""), weekday: String(template.weekday ?? "1"), startTime: String(template.start_time || "08:00"), endTime: String(template.end_time || "09:00") })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteAttendanceTemplate(Number(template.id))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">Nenhum modelo ativo cadastrado.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderApplyTemplateSection = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aplicar pacote no funcionario</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Select value={applyEmployeeId} onValueChange={setApplyEmployeeId}>
            <SelectTrigger><SelectValue placeholder="Funcionario" /></SelectTrigger>
            <SelectContent>
              {activeAttendanceEmployees.map((employee) => (
                <SelectItem key={employee.id} value={String(employee.id)}>{employee.name || `Funcionario ${employee.id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="number" min={0} max={180} value={applyToleranceMin} onChange={(event) => setApplyToleranceMin(event.target.value)} placeholder="Tolerancia (min)" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={replaceTemplateSchedules} onChange={(event) => setReplaceTemplateSchedules(event.target.checked)} />
            Substituir templates atuais
          </label>
          <Button onClick={applyTemplates} disabled={!isAdmin || !applyEmployeeId}>Aplicar selecionados</Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelectedTemplateIds(attendanceTemplates.map((item) => String(item.id)))}>Selecionar todos</Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedTemplateIds([])}>Limpar selecao</Button>
        </div>
        <div className="max-h-56 overflow-auto border rounded-md p-2 space-y-2">
          {attendanceTemplates.length ? attendanceTemplates.map((template) => {
            const id = String(template.id);
            const checked = selectedTemplateIds.includes(id);
            return (
              <label key={id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={checked} onChange={() => toggleTemplateSelection(id)} />
                <span>{template.activity_label || template.catalog_name || "Aula"} - {WEEKDAY_LABELS[Number(template.weekday) || 0]} {template.start_time} as {template.end_time}</span>
              </label>
            );
          }) : (
            <div className="text-sm text-muted-foreground">Sem modelos para aplicar.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderNewScheduleSection = (
    <Card className="border shadow-sm border-emerald-500/20 shadow-emerald-500/10">
      <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <Plus className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Nova Escala de Trabalho</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Defina horários e atividades para um funcionário.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium px-1">Funcionário</label>
            <Select value={newSchedule.employeeId || defaultEmployeeId} onValueChange={(value) => setNewSchedule((prev) => ({ ...prev, employeeId: value }))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {activeAttendanceEmployees.map((employee) => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {employee.name || `Funcionário ${employee.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium px-1">Tipo de Atividade</label>
            <Select
              value={scheduleType}
              onValueChange={(value: "function" | "class") => {
                const pool = value === "class" ? classActivities : functionActivities;
                const first = pool[0];
                setScheduleType(value);
                setNewSchedule((prev) => ({
                  ...prev,
                  activityId: first ? String(first.id) : "",
                  valuePerClass: value === "class" ? String(Number(first?.default_value || 0)) : "0",
                }));
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="function">Função Geral</SelectItem>
                <SelectItem value="class">Aula Específica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-xs font-medium px-1">Atividade Associada</label>
            <Select
              value={newSchedule.activityId}
              onValueChange={(value) => {
                const activity = attendanceCatalog.find((row) => String(row.id) === String(value));
                setNewSchedule((prev) => ({
                  ...prev,
                  activityId: value,
                  valuePerClass: scheduleType === "class" ? String(Number(activity?.default_value || 0)) : prev.valuePerClass,
                }));
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Qual a atividade que será exercida?" />
              </SelectTrigger>
              <SelectContent>
                {scheduleActivityOptions.map((activity) => (
                  <SelectItem key={activity.id} value={String(activity.id)}>
                    {activity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium px-1">Dia da Semana</label>
            <Select value={newSchedule.weekday} onValueChange={(value) => setNewSchedule((prev) => ({ ...prev, weekday: value }))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Ex: Segunda-feira" />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((label, idx) => (
                  <SelectItem key={label} value={String(idx)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium px-1">Horário de Início</label>
            <div className="relative">
              <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="time" className="pl-9 h-9 font-mono" value={newSchedule.startTime} onChange={(event) => setNewSchedule((prev) => ({ ...prev, startTime: event.target.value }))} />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-medium px-1">Horário de Término</label>
            <div className="relative">
              <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="time" className="pl-9 h-9 font-mono" value={newSchedule.endTime} onChange={(event) => setNewSchedule((prev) => ({ ...prev, endTime: event.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium px-1">Tolerância (minutos)</label>
            <Input
              className="h-9 font-mono"
              type="number"
              min={0}
              max={180}
              value={newSchedule.toleranceMin}
              onChange={(event) => setNewSchedule((prev) => ({ ...prev, toleranceMin: event.target.value }))}
              placeholder="Ex: 15"
            />
          </div>

          {scheduleType === "class" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium px-1 text-emerald-600 dark:text-emerald-400">Valor por Aula (R$)</label>
              <Input
                className="h-9 font-mono border-emerald-500/30 focus-visible:ring-emerald-500"
                type="number"
                min={0}
                step="0.01"
                value={newSchedule.valuePerClass}
                onChange={(event) => setNewSchedule((prev) => ({ ...prev, valuePerClass: event.target.value }))}
                placeholder="R$ 0,00"
              />
            </div>
          )}
        </div>
        
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-border/50 mt-4">
          <Button variant="ghost" size="sm" onClick={() => setIsCreatingSchedule(false)}>
            Cancelar
          </Button>
          <Button onClick={createSchedule} size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!newSchedule.employeeId || !newSchedule.activityId}>
            <Check className="h-4 w-4" />
            Salvar Escala
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderScheduleEditCard = editingSchedule ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Editar escala #{editingSchedule.id}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            value={editingSchedule.scheduleType}
            onValueChange={(value: "function" | "class") => {
              const pool = value === "class" ? classActivities : functionActivities;
              const first = pool[0];
              setEditingSchedule((prev) => prev ? {
                ...prev,
                scheduleType: value,
                activityId: first ? String(first.id) : "",
                valuePerClass: value === "class" ? String(Number(first?.default_value || 0)) : "0",
              } : prev);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="function">Funcao</SelectItem>
              <SelectItem value="class">Aula</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={editingSchedule.activityId}
            onValueChange={(value) => {
              const activity = attendanceCatalog.find((row) => String(row.id) === String(value));
              setEditingSchedule((prev) => prev ? {
                ...prev,
                activityId: value,
                valuePerClass: prev.scheduleType === "class" ? String(Number(activity?.default_value || 0)) : prev.valuePerClass,
              } : prev);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Atividade" /></SelectTrigger>
            <SelectContent>
              {(editingSchedule.scheduleType === "class" ? classActivities : functionActivities).map((activity) => (
                <SelectItem key={activity.id} value={String(activity.id)}>{activity.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={editingSchedule.weekday} onValueChange={(value) => setEditingSchedule((prev) => prev ? { ...prev, weekday: value } : prev)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEEKDAY_LABELS.map((label, idx) => (
                <SelectItem key={label} value={String(idx)}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="time" value={editingSchedule.startTime} onChange={(event) => setEditingSchedule((prev) => prev ? { ...prev, startTime: event.target.value } : prev)} />
          <Input type="time" value={editingSchedule.endTime} onChange={(event) => setEditingSchedule((prev) => prev ? { ...prev, endTime: event.target.value } : prev)} />
          <Input type="number" min={0} max={180} value={editingSchedule.toleranceMin} onChange={(event) => setEditingSchedule((prev) => prev ? { ...prev, toleranceMin: event.target.value } : prev)} placeholder="Tolerancia (min)" />
          {editingSchedule.scheduleType === "class" ? (
            <Input type="number" min={0} step="0.01" value={editingSchedule.valuePerClass} onChange={(event) => setEditingSchedule((prev) => prev ? { ...prev, valuePerClass: event.target.value } : prev)} placeholder="Valor por aula" />
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button onClick={saveScheduleEdit}>Salvar alteracoes</Button>
          <Button variant="ghost" onClick={() => setEditingSchedule(null)}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  ) : null;

  const renderSchedulesTable = (
    <Card className="overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-semibold">Funcionário</TableHead>
              <TableHead className="font-semibold">Dia da Semana</TableHead>
              <TableHead className="font-semibold">Horário</TableHead>
              <TableHead className="font-semibold">Atividade</TableHead>
              <TableHead className="font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold text-right">Valor Aula</TableHead>
              <TableHead className="font-semibold text-right">Tolerância</TableHead>
              {isAdmin && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSchedules.length ? filteredSchedules.map((schedule) => (
              <TableRow key={schedule.id} className="group hover:bg-muted/20 transition-colors">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                      {(schedule.employeeName || "F")[0].toUpperCase()}
                    </div>
                    {schedule.employeeName || `Funcionário ${schedule.employee_id}`}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-background">
                    {WEEKDAY_LABELS[Number(schedule.weekday) || 0]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 font-mono text-sm bg-muted/30 w-fit px-2 py-1 rounded border border-border/50">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span>{schedule.start_time || "--:--"}</span>
                    <span className="text-muted-foreground">→</span>
                    <span>{schedule.end_time || "--:--"}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[150px] truncate" title={schedule.activity_label_resolved || schedule.class_name || "-"}>
                  {schedule.activity_label_resolved || schedule.class_name || "-"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={schedule.schedule_type === "class" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-orange-500/10 text-orange-600 dark:text-orange-400"}>
                    {scheduleTypeLabel(schedule.schedule_type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {schedule.schedule_type === "class" ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">R$ {Number(schedule.value_per_class || 0).toFixed(2)}</span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">
                  {Number(schedule.tolerance_min || 0)} min
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" onClick={() => openScheduleEdit(schedule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => deactivateSchedule(Number(schedule.id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={isAdmin ? 8 : 7} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <CalendarClock className="h-10 w-10 mb-2 opacity-20" />
                    <p>Nenhuma escala ativa para os filtros selecionados.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );

  const lateNames = todayStats.lateEmployeeIds.map((id) => employeeNameById.get(String(id)) || `Funcionario ${id}`);
  const absentNames = todayStats.absentEmployeeIds.map((id) => employeeNameById.get(String(id)) || `Funcionario ${id}`);
  const openShiftNames = todayStats.openShiftEmployeeIds.map((id) => employeeNameById.get(String(id)) || `Funcionario ${id}`);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Sistema de Ponto</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-1" asChild>
            <a href={reportLinks.html} target="_blank" rel="noreferrer">
              <Calendar className="h-4 w-4" /> Abrir relatorio
            </a>
          </Button>
          <Button variant="outline" className="gap-1" asChild>
            <a href={reportLinks.csv} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" /> Baixar CSV
            </a>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Operacao diaria no topo. Configuracao completa no assistente guiado para reduzir ruido e erros.
        </CardContent>
      </Card>

      <Tabs value={mainView} onValueChange={(value) => setMainView(value as MainView)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="today" className="gap-1">
            <TimerReset className="h-4 w-4" /> Hoje
          </TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="schedules" className="gap-1">
              <ListChecks className="h-4 w-4" /> Escalas
            </TabsTrigger>
          ) : null}
          {isAdmin ? (
            <TabsTrigger value="team" className="gap-1">
              <User className="h-4 w-4" /> Funcionarios
            </TabsTrigger>
          ) : null}
          {isAdmin ? (
            <TabsTrigger value="setup" className="gap-1">
              <Settings2 className="h-4 w-4" /> Configuracao
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Entradas de hoje</div>
                <div className="mt-1 text-2xl font-semibold">{todayStats.entries}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Saidas de hoje</div>
                <div className="mt-1 text-2xl font-semibold">{todayStats.exits}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Atrasos/Faltas</div>
                <div className="mt-1 text-2xl font-semibold">{todayStats.lateEmployeeIds.length + todayStats.absentEmployeeIds.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Turnos abertos</div>
                <div className="mt-1 text-2xl font-semibold">{todayStats.openShiftEmployeeIds.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acoes rapidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select value={quickEmployeeId || defaultEmployeeId} onValueChange={setQuickEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Funcionario" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAttendanceEmployees.map((employee) => (
                      <SelectItem key={employee.id} value={String(employee.id)}>
                        {employee.name || `Funcionario ${employee.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={quickNote}
                  onChange={(event) => setQuickNote(event.target.value)}
                  placeholder="Observacao opcional"
                />
                <div className="flex flex-wrap gap-2">
                  {isAdmin ? (
                    <Button onClick={() => handleManualPunch("entry")} disabled={sendingManualPunch || !quickEmployeeId} className="gap-1">
                      <LogIn className="h-4 w-4" /> Registrar entrada
                    </Button>
                  ) : null}
                  {isAdmin ? (
                    <Button onClick={() => handleManualPunch("exit")} disabled={sendingManualPunch || !quickEmployeeId} variant="secondary" className="gap-1">
                      <LogOut className="h-4 w-4" /> Registrar saida
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setTodayView("history")} className="gap-1">
                    <Calendar className="h-4 w-4" /> Ver historico
                  </Button>
                </div>
              </div>

              {isAdmin ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <Input type="date" value={justificationDate} onChange={(event) => setJustificationDate(event.target.value)} />
                  <Textarea
                    value={justificationReason}
                    onChange={(event) => setJustificationReason(event.target.value)}
                    placeholder="Motivo da justificativa"
                    className="lg:col-span-2"
                  />
                  <Button variant="outline" onClick={handleCreateJustification} disabled={sendingJustification || !quickEmployeeId} className="w-fit gap-1">
                    <FileWarning className="h-4 w-4" /> Justificar falta
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Pendencias de hoje</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Atrasados</div>
                  {lateNames.length ? (
                    <div className="flex flex-wrap gap-2">
                      {lateNames.map((name) => (
                        <Badge key={name} variant="secondary">{name}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Sem atrasos no momento.</div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Sem entrada registrada</div>
                  {absentNames.length ? (
                    <div className="flex flex-wrap gap-2">
                      {absentNames.map((name) => (
                        <Badge key={name} variant="outline">{name}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Ninguem pendente nesta janela.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Turnos em aberto</CardTitle>
              </CardHeader>
              <CardContent>
                {openShiftNames.length ? (
                  <div className="space-y-2">
                    {openShiftNames.map((name) => (
                      <div key={name} className="text-sm">{name}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Sem turnos em aberto agora.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Tabs value={todayView} onValueChange={(value) => setTodayView(value as TodayView)}>
            <TabsList>
              <TabsTrigger value="overview" className="gap-1">
                <ShieldCheck className="h-4 w-4" /> Escala do dia
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1">
                <Calendar className="h-4 w-4" /> Historico
              </TabsTrigger>
              <TabsTrigger value="map" className="gap-1">
                <MapPin className="h-4 w-4" /> Mapa
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Escalas de hoje ({WEEKDAY_LABELS[todayWeekday]})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Funcionario</TableHead>
                        <TableHead>Inicio</TableHead>
                        <TableHead>Fim</TableHead>
                        <TableHead>Atividade</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {todaySchedules.length ? todaySchedules.map((schedule) => {
                        const counts = todayRecordByEmployee.get(String(schedule.employee_id || ""));
                        const status = !counts
                          ? "Sem entrada"
                          : counts.entries > counts.exits
                            ? "Em turno"
                            : "Concluido";
                        return (
                          <TableRow key={schedule.id}>
                            <TableCell className="font-medium">{schedule.employeeName || `Funcionario ${schedule.employee_id}`}</TableCell>
                            <TableCell>{schedule.start_time || "--:--"}</TableCell>
                            <TableCell>{schedule.end_time || "--:--"}</TableCell>
                            <TableCell>{schedule.activity_label_resolved || schedule.class_name || "-"}</TableCell>
                            <TableCell>
                              <Badge variant={status === "Em turno" ? "default" : "secondary"}>{status}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Nenhuma escala para hoje.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {renderRecordsFilters}
              {renderRecordsTable}
            </TabsContent>

            {renderMap}
          </Tabs>
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="schedules" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/10 p-4 rounded-lg border border-border/50">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-primary" />
                  Gestão de Escalas
                </h3>
                <p className="text-sm text-muted-foreground">Gerencie os horários e atividades da sua equipe.</p>
              </div>
              <Button onClick={() => setIsCreatingSchedule(!isCreatingSchedule)} className="gap-2" variant={isCreatingSchedule ? "secondary" : "default"}>
                {isCreatingSchedule ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {isCreatingSchedule ? "Cancelar" : "Adicionar Escala"}
              </Button>
            </div>
            
            {isCreatingSchedule && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-200">
                {renderNewScheduleSection}
              </div>
            )}
            
            {renderRecordsFilters}
            {renderScheduleEditCard}
            {renderSchedulesTable}
          </TabsContent>
        ) : null}

        {isAdmin ? (
          <TabsContent value="team" className="space-y-4">
            {renderEmployeesSection}
          </TabsContent>
        ) : null}

        {isAdmin ? (
          <TabsContent value="setup" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assistente de configuracao</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={wizardProgress} />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  {[
                    { label: "1. Funcionarios", ready: wizardReady.employees },
                    { label: "2. Catalogo", ready: wizardReady.catalog },
                    { label: "3. Modelos e aplicacao", ready: wizardReady.templates },
                    { label: "4. Revisao", ready: wizardReady.schedules },
                  ].map((step, index) => (
                    <Button
                      key={step.label}
                      variant={wizardStep === index ? "default" : "outline"}
                      onClick={() => {
                        if (!canGoToStep(index)) {
                          toast.error("Conclua as etapas anteriores para avancar.");
                          return;
                        }
                        setWizardStep(index);
                      }}
                      className="justify-between"
                    >
                      <span>{step.label}</span>
                      {step.ready ? <CheckCircle className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {wizardStep === 0 ? renderEmployeesSection : null}
            {wizardStep === 1 ? (
              <div className="space-y-4">
                {renderCatalogSection}
                {renderTemplatesSection}
              </div>
            ) : null}
            {wizardStep === 2 ? (
              <div className="space-y-4">
                {renderApplyTemplateSection}
                {renderNewScheduleSection}
              </div>
            ) : null}
            {wizardStep === 3 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Revisao final</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">Funcionarios ativos</div>
                        <div className="text-xl font-semibold">{activeAttendanceEmployees.length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">Itens de catalogo</div>
                        <div className="text-xl font-semibold">{attendanceCatalog.length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">Modelos ativos</div>
                        <div className="text-xl font-semibold">{attendanceTemplates.length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-xs text-muted-foreground">Escalas ativas</div>
                        <div className="text-xl font-semibold">{attendanceSchedules.length}</div>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setMainView("schedules")}>Ir para Escalas</Button>
                    <Button variant="outline" onClick={() => setMainView("today")}>Ir para Operacao de Hoje</Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Collapsible open={showAdvancedConfig} onOpenChange={setShowAdvancedConfig}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Modo avancado</CardTitle>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm">
                      {showAdvancedConfig ? "Ocultar" : "Mostrar"}
                    </Button>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    {renderScheduleEditCard}
                    {renderNewScheduleSection}
                    {renderSchedulesTable}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </TabsContent>
        ) : null}
      </Tabs>

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          {isAdmin
            ? "Admin: operacao diaria no painel Hoje, configuracao no assistente e ajustes finos no modo avancado."
            : "Usuario: acesso focado na operacao e consultas do dia para evitar configuracoes acidentais."}
        </CardContent>
      </Card>

      {!isAdmin && attendanceSummary.length ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {attendanceSummary.slice(0, 3).map((summary) => (
            <Card key={summary.employee}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{summary.employee}</p>
                    <p className="text-xs text-muted-foreground">
                      {summary.entradas} entradas - {summary.saidas} saidas
                      {summary.outsideRadius > 0 ? (
                        <span className="text-destructive"> - {summary.outsideRadius} fora do raio</span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
