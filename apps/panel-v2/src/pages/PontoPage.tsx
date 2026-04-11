import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Clock, Download, Calendar, User, CheckCircle, XCircle, ListChecks, MapPin, Plus, Trash2, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePanelData } from "@/hooks/use-panel-data";
import { apiFetch, jsonHeaders } from "@/lib/panel-api";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

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

function formatDateBr(value?: string) {
  if (!value) return "-";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
  } catch {
    return value;
  }
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

  const employeeOptions = useMemo(() => ([
    { id: "Todos", label: "Todos" },
    ...attendanceEmployees.map((employee) => ({
      id: String(employee.id),
      label: employee.name || `Funcionario ${employee.id}`,
    })),
  ]), [attendanceEmployees]);

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
      ? attendanceEmployees[0]
      : attendanceEmployees.find((employee) => String(employee.id) === String(selectedEmployeeValue));
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
  }, [attendanceEmployees, attendanceFromDate, attendanceToDate, selectedEmployeeValue]);

  const geoRecords = useMemo(() => (
    filteredRecords.filter((record) => Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lng)) && !(Number(record.lat) === 0 && Number(record.lng) === 0))
  ), [filteredRecords]);

  const [selectedMapRecordId, setSelectedMapRecordId] = useState<string>("");
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

  const isAdmin = user?.role === "admin";
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
    () => String(attendanceEmployees[0]?.id || ""),
    [attendanceEmployees],
  );
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

  useEffect(() => {
    if (!newSchedule.employeeId && defaultEmployeeId) {
      setNewSchedule((prev) => ({ ...prev, employeeId: defaultEmployeeId }));
    }
    if (!applyEmployeeId && defaultEmployeeId) {
      setApplyEmployeeId(defaultEmployeeId);
    }
  }, [applyEmployeeId, defaultEmployeeId, newSchedule.employeeId]);

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
          Historico carregado pelo periodo selecionado. Se voce deixar em branco, usamos os ultimos 90 dias.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(attendanceSummary.length ? attendanceSummary : attendanceEmployees.slice(0, 3).map((employee) => ({
          employee: employee.name || `Funcionario ${employee.id}`,
          entradas: 0,
          saidas: 0,
          outsideRadius: 0,
        }))).map((summary) => (
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

      <Tabs defaultValue="records">
        <TabsList>
          <TabsTrigger value="records" className="gap-1">
            <Calendar className="h-4 w-4" /> Historico
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1">
            <ListChecks className="h-4 w-4" /> Escalas
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1">
            <MapPin className="h-4 w-4" /> Localizacao
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
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

          {isAdmin ? (
            <Card>
            <CardHeader>
              <CardTitle className="text-base">Aplicar pacote no funcionario</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Select value={applyEmployeeId} onValueChange={setApplyEmployeeId}>
                  <SelectTrigger><SelectValue placeholder="Funcionario" /></SelectTrigger>
                  <SelectContent>
                    {attendanceEmployees.map((employee) => (
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
          ) : null}

          {isAdmin ? (
            <Card>
            <CardHeader>
              <CardTitle className="text-base">Nova escala</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select value={newSchedule.employeeId || defaultEmployeeId} onValueChange={(value) => setNewSchedule((prev) => ({ ...prev, employeeId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Funcionario" />
                  </SelectTrigger>
                  <SelectContent>
                    {attendanceEmployees.map((employee) => (
                      <SelectItem key={employee.id} value={String(employee.id)}>
                        {employee.name || `Funcionario ${employee.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="function">Funcao</SelectItem>
                    <SelectItem value="class">Aula</SelectItem>
                  </SelectContent>
                </Select>

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
                  <SelectTrigger>
                    <SelectValue placeholder="Atividade" />
                  </SelectTrigger>
                  <SelectContent>
                    {scheduleActivityOptions.map((activity) => (
                      <SelectItem key={activity.id} value={String(activity.id)}>
                        {activity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={newSchedule.weekday} onValueChange={(value) => setNewSchedule((prev) => ({ ...prev, weekday: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Dia da semana" />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <SelectItem key={label} value={String(idx)}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input type="time" value={newSchedule.startTime} onChange={(event) => setNewSchedule((prev) => ({ ...prev, startTime: event.target.value }))} />
                <Input type="time" value={newSchedule.endTime} onChange={(event) => setNewSchedule((prev) => ({ ...prev, endTime: event.target.value }))} />

                <Input
                  type="number"
                  min={0}
                  max={180}
                  value={newSchedule.toleranceMin}
                  onChange={(event) => setNewSchedule((prev) => ({ ...prev, toleranceMin: event.target.value }))}
                  placeholder="Tolerancia (min)"
                />
                {scheduleType === "class" ? (
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newSchedule.valuePerClass}
                    onChange={(event) => setNewSchedule((prev) => ({ ...prev, valuePerClass: event.target.value }))}
                    placeholder="Valor por aula"
                  />
                ) : null}
              </div>
              <Button onClick={createSchedule} className="gap-1" disabled={!newSchedule.employeeId || !newSchedule.activityId}>
                <Plus className="h-4 w-4" />
                Criar escala
              </Button>
            </CardContent>
            </Card>
          ) : null}

          {isAdmin && editingSchedule ? (
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
          ) : null}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionario</TableHead>
                    <TableHead>Dia</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor aula</TableHead>
                    <TableHead>Tolerancia</TableHead>
                    {isAdmin ? <TableHead>Acoes</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.length ? filteredSchedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell className="font-medium">{schedule.employeeName || `Funcionario ${schedule.employee_id}`}</TableCell>
                      <TableCell>{WEEKDAY_LABELS[Number(schedule.weekday) || 0]}</TableCell>
                      <TableCell className="font-mono">{schedule.start_time || "--:--"}</TableCell>
                      <TableCell className="font-mono">{schedule.end_time || "--:--"}</TableCell>
                      <TableCell>{schedule.activity_label_resolved || schedule.class_name || "-"}</TableCell>
                      <TableCell>{scheduleTypeLabel(schedule.schedule_type)}</TableCell>
                      <TableCell>{Number(schedule.value_per_class || 0).toFixed(2)}</TableCell>
                      <TableCell>{Number(schedule.tolerance_min || 0)} min</TableCell>
                      {isAdmin ? (
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={() => openScheduleEdit(schedule)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deactivateSchedule(Number(schedule.id))}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 9 : 8} className="text-center text-muted-foreground py-8">
                        Nenhuma escala ativa para este filtro.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

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
      </Tabs>
    </div>
  );
}
