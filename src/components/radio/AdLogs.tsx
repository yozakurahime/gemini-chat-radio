import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, FileText, Loader2 } from "lucide-react";
import { useAdLogs } from "@/hooks/useRadioData";
import { format } from "date-fns";

export default function AdLogs() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const { data: logs = [], isLoading } = useAdLogs(date);

  const successCount = logs.filter((l) => l.status === "success").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="default">{successCount} executados</Badge>
          <Badge variant="destructive">{failedCount} falhas</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Logs — {new Date(date + "T12:00:00").toLocaleDateString("pt-BR")} ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horário</TableHead>
                  <TableHead>Anúncio</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Duração Real</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                ) : logs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum log para esta data</TableCell></TableRow>
                ) : (
                  logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{format(new Date(l.played_at), "HH:mm:ss")}</TableCell>
                      <TableCell>{l.ad?.name || "—"}</TableCell>
                      <TableCell>{l.advertiser?.company_name || "—"}</TableCell>
                      <TableCell>{l.actual_duration_seconds ? `${l.actual_duration_seconds}s` : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={l.status === "success" ? "default" : "destructive"}>
                          {l.status === "success" ? "OK" : l.status === "failed" ? "Falha" : "Pulado"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-destructive max-w-40 truncate">{l.error_message || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
