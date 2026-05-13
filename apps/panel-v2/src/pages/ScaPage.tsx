import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCcw, Upload, Database } from "lucide-react";
import { usePanelData } from "@/hooks/use-panel-data";
import { formatDateTimeBr } from "@/lib/date-time";

type ImportType = "students" | "access" | "enrollments";

type MappingState = Record<string, string>;

const STUDENTS_FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: "external_id", label: "Coluna da Matricula/ID", placeholder: "Ex: Matricula" },
  { key: "name", label: "Coluna do Nome", placeholder: "Ex: Nome Completo" },
  { key: "phone", label: "Coluna do Telefone", placeholder: "Ex: Telefone" },
  { key: "cpf", label: "Coluna do CPF/CNPJ", placeholder: "Ex: CPF" },
  { key: "status", label: "Coluna de Status", placeholder: "Ex: Situacao" },
  { key: "plan", label: "Coluna de Plano", placeholder: "Ex: Plano" },
];

const ACCESS_FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: "external_id", label: "Coluna da Matricula/ID", placeholder: "Ex: Matricula" },
  { key: "name", label: "Coluna do Nome", placeholder: "Ex: Nome" },
  { key: "phone", label: "Coluna do Telefone", placeholder: "Ex: Telefone" },
  { key: "event_type", label: "Coluna do Tipo de Evento", placeholder: "Ex: Evento" },
  { key: "event_at", label: "Coluna da Data/Hora", placeholder: "Ex: Data Hora" },
  { key: "gate", label: "Coluna da Catraca/Unidade", placeholder: "Ex: Catraca" },
];
const ENROLLMENTS_FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: "external_id", label: "Coluna da Matricula/ID", placeholder: "Ex: Matricula" },
  { key: "name", label: "Coluna do Nome", placeholder: "Ex: Nome" },
  { key: "phone", label: "Coluna do Telefone", placeholder: "Ex: Telefone" },
  { key: "cpf", label: "Coluna do CPF/CNPJ", placeholder: "Ex: CPF" },
  { key: "plan", label: "Coluna do Plano", placeholder: "Ex: Plano" },
  { key: "enrollment_status", label: "Coluna do Status da Matricula", placeholder: "Ex: Situacao" },
  { key: "due_at", label: "Coluna do Vencimento", placeholder: "Ex: Vencimento" },
  { key: "end_at", label: "Coluna da Validade/Fim", placeholder: "Ex: Fim" },
];

function statusBadgeVariant(status?: string): "default" | "secondary" | "destructive" {
  if (status === "mapping_required") return "secondary";
  if (status === "error") return "destructive";
  return "default";
}

export default function ScaPage() {
  const {
    user,
    scaImportHistory,
    refreshScaImportHistory,
    uploadScaImportFile,
    getScaImportMapping,
    saveScaImportMapping,
  } = usePanelData();

  const isAdmin = user?.role === "admin";
  const [studentsFile, setStudentsFile] = useState<File | null>(null);
  const [accessFile, setAccessFile] = useState<File | null>(null);
  const [enrollmentsFile, setEnrollmentsFile] = useState<File | null>(null);
  const [sendingType, setSendingType] = useState<ImportType | "">("");
  const [savingMappingType, setSavingMappingType] = useState<ImportType | "">("");
  const [studentsMapping, setStudentsMapping] = useState<MappingState>({});
  const [accessMapping, setAccessMapping] = useState<MappingState>({});
  const [enrollmentsMapping, setEnrollmentsMapping] = useState<MappingState>({});
  const [studentsLastResult, setStudentsLastResult] = useState<any>(null);
  const [accessLastResult, setAccessLastResult] = useState<any>(null);
  const [enrollmentsLastResult, setEnrollmentsLastResult] = useState<any>(null);

  const historyItems = useMemo(() => scaImportHistory || [], [scaImportHistory]);

  const loadMappings = async () => {
    if (!isAdmin) return;
    const [students, access, enrollments] = await Promise.all([
      getScaImportMapping("students"),
      getScaImportMapping("access"),
      getScaImportMapping("enrollments"),
    ]);
    setStudentsMapping((students || {}) as MappingState);
    setAccessMapping((access || {}) as MappingState);
    setEnrollmentsMapping((enrollments || {}) as MappingState);
  };

  useEffect(() => {
    if (!isAdmin) return;
    void Promise.all([refreshScaImportHistory(undefined, 60), loadMappings()]);
  }, [isAdmin, refreshScaImportHistory]);

  const handleUpload = async (type: ImportType, selectedFile?: File | null) => {
    const file = selectedFile ?? (type === "students" ? studentsFile : type === "access" ? accessFile : enrollmentsFile);
    if (!file || sendingType) return;
    setSendingType(type);
    try {
      const result = await uploadScaImportFile(type, file);
      if (type === "students") setStudentsLastResult(result);
      else if (type === "access") setAccessLastResult(result);
      else setEnrollmentsLastResult(result);
      if (!result.ok && result.error === "mapping_required" && result.detectedMapping) {
        if (type === "students") setStudentsMapping((prev) => ({ ...prev, ...(result.detectedMapping || {}) }));
        else if (type === "access") setAccessMapping((prev) => ({ ...prev, ...(result.detectedMapping || {}) }));
        else setEnrollmentsMapping((prev) => ({ ...prev, ...(result.detectedMapping || {}) }));
      }
      await refreshScaImportHistory(undefined, 60);
      if (result.ok) {
        if (type === "students") setStudentsFile(null);
        else if (type === "access") setAccessFile(null);
        else setEnrollmentsFile(null);
      }
    } finally {
      setSendingType("");
    }
  };

  const handleFileSelected = (type: ImportType, file: File | null) => {
    if (type === "students") setStudentsFile(file);
    else if (type === "access") setAccessFile(file);
    else setEnrollmentsFile(file);
    if (file) void handleUpload(type, file);
  };

  const handleSaveMapping = async (type: ImportType) => {
    if (!isAdmin || savingMappingType) return;
    setSavingMappingType(type);
    try {
      const mapping = type === "students" ? studentsMapping : type === "access" ? accessMapping : enrollmentsMapping;
      const ok = await saveScaImportMapping(type, mapping);
      if (ok) await loadMappings();
    } finally {
      setSavingMappingType("");
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Somente administradores podem usar o modulo SCA.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Database className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">SCA - Importacao Manual</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importar Alunos</CardTitle>
            <CardDescription>Envie arquivo XLS/XLSX/CSV com cadastro de alunos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={(event) => handleFileSelected("students", event.target.files?.[0] || null)}
              disabled={sendingType !== ""}
            />
            <Button className="gap-1" onClick={() => handleUpload("students")} disabled={!studentsFile || sendingType !== ""}>
              <Upload className="h-4 w-4" /> {sendingType === "students" ? "Enviando..." : "Importar alunos"}
            </Button>
            {studentsFile ? <p className="text-xs text-muted-foreground">Arquivo: {studentsFile.name}</p> : null}
            {studentsLastResult ? (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p><strong>Status:</strong> {studentsLastResult.ok ? "ok" : studentsLastResult.error || "erro"}</p>
                <p><strong>Aceitos:</strong> {Number(studentsLastResult.acceptedCount || 0)} | <strong>Rejeitados:</strong> {Number(studentsLastResult.rejectedCount || 0)}</p>
                <p><strong>Confianca mapeamento:</strong> {Math.round(Number((studentsLastResult.mappingConfidence ?? studentsLastResult.confidence ?? 0)) * 100)}%</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importar Acessos</CardTitle>
            <CardDescription>Envie arquivo XLS/XLSX/CSV de eventos de acesso/catraca.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={(event) => handleFileSelected("access", event.target.files?.[0] || null)}
              disabled={sendingType !== ""}
            />
            <Button className="gap-1" onClick={() => handleUpload("access")} disabled={!accessFile || sendingType !== ""}>
              <Upload className="h-4 w-4" /> {sendingType === "access" ? "Enviando..." : "Importar acessos"}
            </Button>
            {accessFile ? <p className="text-xs text-muted-foreground">Arquivo: {accessFile.name}</p> : null}
            {accessLastResult ? (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p><strong>Status:</strong> {accessLastResult.ok ? "ok" : accessLastResult.error || "erro"}</p>
                <p><strong>Aceitos:</strong> {Number(accessLastResult.acceptedCount || 0)} | <strong>Rejeitados:</strong> {Number(accessLastResult.rejectedCount || 0)}</p>
                <p><strong>Confianca mapeamento:</strong> {Math.round(Number((accessLastResult.mappingConfidence ?? accessLastResult.confidence ?? 0)) * 100)}%</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importar Matriculas</CardTitle>
            <CardDescription>Envie arquivo XLS/XLSX/CSV com status de matricula, vencimento e plano.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={(event) => handleFileSelected("enrollments", event.target.files?.[0] || null)}
              disabled={sendingType !== ""}
            />
            <Button className="gap-1" onClick={() => handleUpload("enrollments")} disabled={!enrollmentsFile || sendingType !== ""}>
              <Upload className="h-4 w-4" /> {sendingType === "enrollments" ? "Enviando..." : "Importar matriculas"}
            </Button>
            {enrollmentsFile ? <p className="text-xs text-muted-foreground">Arquivo: {enrollmentsFile.name}</p> : null}
            {enrollmentsLastResult ? (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p><strong>Status:</strong> {enrollmentsLastResult.ok ? "ok" : enrollmentsLastResult.error || "erro"}</p>
                <p><strong>Aceitos:</strong> {Number(enrollmentsLastResult.acceptedCount || 0)} | <strong>Rejeitados:</strong> {Number(enrollmentsLastResult.rejectedCount || 0)}</p>
                <p><strong>Confianca mapeamento:</strong> {Math.round(Number((enrollmentsLastResult.mappingConfidence ?? enrollmentsLastResult.confidence ?? 0)) * 100)}%</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapeamento Manual - Alunos</CardTitle>
            <CardDescription>Preencha com o nome exato das colunas do seu arquivo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {STUDENTS_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label>{field.label}</Label>
                <Input
                  value={String(studentsMapping[field.key] || "")}
                  onChange={(event) => setStudentsMapping((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
            <Button className="gap-1" onClick={() => handleSaveMapping("students")} disabled={savingMappingType !== ""}>
              {savingMappingType === "students" ? "Salvando..." : "Salvar mapeamento de alunos"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapeamento Manual - Acessos</CardTitle>
            <CardDescription>Use os nomes de colunas para evento, data/hora e identificacao.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ACCESS_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label>{field.label}</Label>
                <Input
                  value={String(accessMapping[field.key] || "")}
                  onChange={(event) => setAccessMapping((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
            <Button className="gap-1" onClick={() => handleSaveMapping("access")} disabled={savingMappingType !== ""}>
              {savingMappingType === "access" ? "Salvando..." : "Salvar mapeamento de acessos"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapeamento Manual - Matriculas</CardTitle>
            <CardDescription>Mapeie status, vencimento e validade para detectar vencidos/atrasados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ENROLLMENTS_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label>{field.label}</Label>
                <Input
                  value={String(enrollmentsMapping[field.key] || "")}
                  onChange={(event) => setEnrollmentsMapping((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
            <Button className="gap-1" onClick={() => handleSaveMapping("enrollments")} disabled={savingMappingType !== ""}>
              {savingMappingType === "enrollments" ? "Salvando..." : "Salvar mapeamento de matriculas"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status e Historico</CardTitle>
          <CardDescription>Ultimas importacoes executadas no modulo SCA.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1" onClick={() => refreshScaImportHistory(undefined, 60)}>
              <RefreshCcw className="h-4 w-4" /> Atualizar
            </Button>
          </div>

          {historyItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma importacao registrada ainda.</p>
          ) : (
            historyItems.map((item) => (
              <div key={item.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
                  <Badge variant="outline">
                    {item.import_type === "students" ? "Alunos" : item.import_type === "access" ? "Acessos" : "Matriculas"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTimeBr(item.created_at, "-")}</span>
                </div>
                <p className="text-sm font-medium">{item.original_filename}</p>
                <p className="text-xs text-muted-foreground">
                  Linhas: {Number(item.rows_total || 0)} | Aceitos: {Number(item.accepted_count || 0)} | Rejeitados: {Number(item.rejected_count || 0)}
                </p>
                <a href={`/admin/sca/imports/${encodeURIComponent(String(item.id))}/csv`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="gap-1">
                    <Download className="h-4 w-4" /> Baixar CSV convertido
                  </Button>
                </a>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
