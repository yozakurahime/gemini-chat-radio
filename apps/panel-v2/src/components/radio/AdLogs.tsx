import { useState } from "react";
import { Calendar, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdLogs } from "@/hooks/useRadioData";

export default function AdLogs() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: logs = [], isLoading } = useAdLogs(date);

  const successCount = logs.filter((l) => l.status === "success").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="default">{successCount} executados</Badge>
          <Badge variant="destructive">{failedCount} falhas</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Logs ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horario</TableHead>
                  <TableHead>Anuncio</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Duracao real</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>
                ) : !logs.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum log para esta data</TableCell></TableRow>
                ) : (
                  logs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{format(new Date(row.played_at), "HH:mm:ss")}</TableCell>
                      <TableCell>{row.ad?.name || "-"}</TableCell>
                      <TableCell>{row.advertiser?.company_name || "-"}</TableCell>
                      <TableCell>{row.actual_duration_seconds ? `${row.actual_duration_seconds}s` : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "success" ? "default" : row.status === "failed" ? "destructive" : "secondary"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs text-destructive">{row.error_message || "-"}</TableCell>
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
