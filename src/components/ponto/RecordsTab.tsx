import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Clock as ClockIcon } from "lucide-react";
import type { Employee, PontoRecord } from "@/hooks/usePontoData";

interface Props {
  records: PontoRecord[];
  employees: Employee[];
  selectedEmployee: string;
  setSelectedEmployee: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
}

export default function RecordsTab({ records, employees, selectedEmployee, setSelectedEmployee, dateFilter, setDateFilter }: Props) {
  const activeEmployees = employees.filter((e) => e.active);
  const getEmployeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? "Desconhecido";

  const filtered = records.filter((r) => {
    if (selectedEmployee !== "Todos" && r.employee_id !== selectedEmployee) return false;
    if (dateFilter && r.date !== dateFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 flex-wrap">
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                {activeEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-48" />
            {(selectedEmployee !== "Todos" || dateFilter) && (
              <Button variant="ghost" onClick={() => { setSelectedEmployee("Todos"); setDateFilter(""); }}>
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Hora</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{getEmployeeName(r.employee_id)}</TableCell>
                  <TableCell>
                    <Badge variant={r.type === "entrada" ? "default" : "secondary"}>
                      {r.type === "entrada" ? "Entrada" : "Saída"}
                    </Badge>
                    {r.auto_closed && (
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        <ClockIcon className="h-3 w-3 mr-0.5" /> Auto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{new Date(r.date + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-mono">{r.time?.slice(0, 5)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {r.source === "whatsapp" ? "WhatsApp" : "Manual"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.lat && r.lng ? (
                      r.within_radius ? (
                        <div className="flex items-center gap-1 text-primary">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-xs">No raio</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-destructive">
                          <XCircle className="h-4 w-4" />
                          <span className="text-xs">Fora do raio</span>
                        </div>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem localização</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
