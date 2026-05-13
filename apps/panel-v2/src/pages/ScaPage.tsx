import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCcw, Upload, Database } from "lucide-react";
import { usePanelData } from "@/hooks/use-panel-data";
import { formatDateTimeBr } from "@/lib/date-time";

type ImportType = "students" | "access" | "enrollments";

function statusBadgeVariant(status?: string): "default" | "secondary" | "destructive" {
  if (status === "mapping_required") return "secondary";
  if (status === "error") return "destructive";
  return "default";
}

const REJECTION_REASON_LABELS: Record<string, string> = {
  identity_required: "Identificacao obrigatoria (nome, matricula, telefone ou CPF)",
  invalid_access_row: "Linha de acesso invalida (tipo/data/identificacao)",
  enrollment_status_or_due_required: "Matricula sem status e sem data de vencimento/validade",
  unknown_error: "Erro nao especificado",
};

function formatRejectedReason(reason: string) {
  return REJECTION_REASON_LABELS[String(reason || "").trim()] || String(reason || "unknown_error").replace(/_/g, " ");
}

function getRejectedSummary(payload: any): Array<{ reason: string; count: number }> {
  const summary = payload?.rejectedSummary && typeof payload.rejectedSummary === "object" ? payload.rejectedSummary : null;
  if (summary) {
    return Object.entries(summary)
      .map(([reason, count]) => ({ reason: String(reason || "unknown_error"), count: Number(count || 0) }))
      .filter((item) => item.count > 0);
  }

  const rejected = Array.isArray(payload?.rejected) ? payload.rejected : [];
  const byReason = rejected.reduce((acc: Record<string, number>, row: any) => {
    const reason = String(row?.error || "unknown_error");
    acc[reason] = Number(acc[reason] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(byReason).map(([reason, count]) => ({ reason, count: Number(count || 0) }));
}

function renderRejectedReasons(payload: any, fallbackRejectedCount = 0) {
  const items = getRejectedSummary(payload);
  const totalRejected = Number((payload?.rejectedCount ?? payload?.rejected_count ?? fallbackRejectedCount) || 0);
  if (totalRejected <= 0 || items.length === 0) return null;
  return (
    <div className="pt-1">
      <p><strong>Motivos rejeicao:</strong></p>
      <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
        {items.map((item) => (
          <li key={`${item.reason}-${item.count}`}>
            {formatRejectedReason(item.reason)}: {item.count}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ScaPage() {
  const {
    user,
    scaImportHistory,
    refreshScaImportHistory,
    uploadScaImportFile,
  } = usePanelData();

  const isAdmin = user?.role === "admin";
  const [studentsFile, setStudentsFile] = useState<File | null>(null);
  const [accessFile, setAccessFile] = useState<File | null>(null);
  const [enrollmentsFile, setEnrollmentsFile] = useState<File | null>(null);
  const [sendingType, setSendingType] = useState<ImportType | "">("");
  const [studentsLastResult, setStudentsLastResult] = useState<any>(null);
  const [accessLastResult, setAccessLastResult] = useState<any>(null);
  const [enrollmentsLastResult, setEnrollmentsLastResult] = useState<any>(null);

  const historyItems = useMemo(() => scaImportHistory || [], [scaImportHistory]);
  const latestStudents = useMemo(
    () => historyItems.find((item) => item.import_type === "students") || null,
    [historyItems],
  );
  const latestAccess = useMemo(
    () => historyItems.find((item) => item.import_type === "access") || null,
    [historyItems],
  );
  const latestEnrollments = useMemo(
    () => historyItems.find((item) => item.import_type === "enrollments") || null,
    [historyItems],
  );

  useEffect(() => {
    if (!isAdmin) return;
    void refreshScaImportHistory(undefined, 60);
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
                {renderRejectedReasons(studentsLastResult, Number(studentsLastResult.rejectedCount || 0))}
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
                {renderRejectedReasons(accessLastResult, Number(accessLastResult.rejectedCount || 0))}
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
                {renderRejectedReasons(enrollmentsLastResult, Number(enrollmentsLastResult.rejectedCount || 0))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo - Alunos</CardTitle>
            <CardDescription>Ultima importacao de cadastro de alunos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {latestStudents ? (
              <>
                <p><strong>Status:</strong> {latestStudents.status || "-"}</p>
                <p><strong>Arquivo:</strong> {latestStudents.original_filename || "-"}</p>
                <p><strong>Atualizado em:</strong> {formatDateTimeBr(latestStudents.created_at, "-")}</p>
                <p><strong>Linhas:</strong> {Number(latestStudents.rows_total || 0)}</p>
                <p><strong>Aceitos:</strong> {Number(latestStudents.accepted_count || 0)} | <strong>Rejeitados:</strong> {Number(latestStudents.rejected_count || 0)}</p>
                <p><strong>Confianca mapeamento:</strong> {Math.round(Number(latestStudents.mapping_confidence || 0) * 100)}%</p>
                {renderRejectedReasons(latestStudents?.result || {}, Number(latestStudents.rejected_count || 0))}
              </>
            ) : (
              <p className="text-muted-foreground">Nenhuma importacao de alunos registrada.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo - Acessos</CardTitle>
            <CardDescription>Ultima importacao de eventos de acesso.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {latestAccess ? (
              <>
                <p><strong>Status:</strong> {latestAccess.status || "-"}</p>
                <p><strong>Arquivo:</strong> {latestAccess.original_filename || "-"}</p>
                <p><strong>Atualizado em:</strong> {formatDateTimeBr(latestAccess.created_at, "-")}</p>
                <p><strong>Linhas:</strong> {Number(latestAccess.rows_total || 0)}</p>
                <p><strong>Aceitos:</strong> {Number(latestAccess.accepted_count || 0)} | <strong>Rejeitados:</strong> {Number(latestAccess.rejected_count || 0)}</p>
                <p><strong>Confianca mapeamento:</strong> {Math.round(Number(latestAccess.mapping_confidence || 0) * 100)}%</p>
                {renderRejectedReasons(latestAccess?.result || {}, Number(latestAccess.rejected_count || 0))}
              </>
            ) : (
              <p className="text-muted-foreground">Nenhuma importacao de acessos registrada.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo - Matriculas</CardTitle>
            <CardDescription>Ultima importacao de vencimento/status de matriculas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {latestEnrollments ? (
              <>
                <p><strong>Status:</strong> {latestEnrollments.status || "-"}</p>
                <p><strong>Arquivo:</strong> {latestEnrollments.original_filename || "-"}</p>
                <p><strong>Atualizado em:</strong> {formatDateTimeBr(latestEnrollments.created_at, "-")}</p>
                <p><strong>Linhas:</strong> {Number(latestEnrollments.rows_total || 0)}</p>
                <p><strong>Aceitos:</strong> {Number(latestEnrollments.accepted_count || 0)} | <strong>Rejeitados:</strong> {Number(latestEnrollments.rejected_count || 0)}</p>
                <p><strong>Confianca mapeamento:</strong> {Math.round(Number(latestEnrollments.mapping_confidence || 0) * 100)}%</p>
                {renderRejectedReasons(latestEnrollments?.result || {}, Number(latestEnrollments.rejected_count || 0))}
              </>
            ) : (
              <p className="text-muted-foreground">Nenhuma importacao de matriculas registrada.</p>
            )}
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
                {renderRejectedReasons(item?.result || {}, Number(item.rejected_count || 0))}
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
