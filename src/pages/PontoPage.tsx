import { useState } from "react";
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
import { Clock, MapPin, Download, Calendar, User, CheckCircle, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PontoRecord {
  id: string;
  employee: string;
  type: "entrada" | "saida";
  date: string;
  time: string;
  lat: number;
  lng: number;
  withinRadius: boolean;
}

const mockRecords: PontoRecord[] = [
  { id: "1", employee: "João Pereira", type: "entrada", date: "2024-12-09", time: "06:02", lat: -23.5505, lng: -46.6333, withinRadius: true },
  { id: "2", employee: "Ana Costa", type: "entrada", date: "2024-12-09", time: "06:15", lat: -23.5505, lng: -46.6333, withinRadius: true },
  { id: "3", employee: "Lucas Lima", type: "entrada", date: "2024-12-09", time: "08:05", lat: -23.5510, lng: -46.6340, withinRadius: false },
  { id: "4", employee: "João Pereira", type: "saida", date: "2024-12-09", time: "14:00", lat: -23.5505, lng: -46.6333, withinRadius: true },
  { id: "5", employee: "Ana Costa", type: "saida", date: "2024-12-09", time: "14:30", lat: -23.5505, lng: -46.6333, withinRadius: true },
  { id: "6", employee: "João Pereira", type: "entrada", date: "2024-12-08", time: "05:58", lat: -23.5505, lng: -46.6333, withinRadius: true },
  { id: "7", employee: "Ana Costa", type: "entrada", date: "2024-12-08", time: "06:10", lat: -23.5505, lng: -46.6333, withinRadius: true },
];

const employees = ["Todos", "João Pereira", "Ana Costa", "Lucas Lima"];

export default function PontoPage() {
  const [selectedEmployee, setSelectedEmployee] = useState("Todos");
  const [dateFilter, setDateFilter] = useState("");

  const filteredRecords = mockRecords.filter((r) => {
    if (selectedEmployee !== "Todos" && r.employee !== selectedEmployee) return false;
    if (dateFilter && r.date !== dateFilter) return false;
    return true;
  });

  // Summary per employee
  const summary = employees.slice(1).map((emp) => {
    const records = mockRecords.filter((r) => r.employee === emp);
    const entradas = records.filter((r) => r.type === "entrada").length;
    const saidas = records.filter((r) => r.type === "saida").length;
    const outsideRadius = records.filter((r) => !r.withinRadius).length;
    return { employee: emp, entradas, saidas, outsideRadius };
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Sistema de Ponto</h1>
        </div>
        <Button variant="outline" className="gap-1">
          <Download className="h-4 w-4" /> Exportar Relatório
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summary.map((s) => (
          <Card key={s.employee}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{s.employee}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.entradas} entradas · {s.saidas} saídas
                    {s.outsideRadius > 0 && (
                      <span className="text-destructive"> · {s.outsideRadius} fora do raio</span>
                    )}
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
            <Calendar className="h-4 w-4" /> Registros
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1">
            <MapPin className="h-4 w-4" /> Localização
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4">
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-48"
                />
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
                    <TableHead>Localização</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.employee}</TableCell>
                      <TableCell>
                        <Badge variant={record.type === "entrada" ? "default" : "secondary"}>
                          {record.type === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(record.date).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="font-mono">{record.time}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {record.lat.toFixed(4)}, {record.lng.toFixed(4)}
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
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="map">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center h-80 bg-muted/50 rounded-lg border-2 border-dashed">
                <div className="text-center text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">Mapa de Localização</p>
                  <p className="text-sm">Integração com mapa será adicionada com coordenadas reais da academia</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
