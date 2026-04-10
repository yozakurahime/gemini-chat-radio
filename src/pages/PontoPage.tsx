import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Clock, MapPin, Download, Calendar, User, CheckCircle, XCircle,
  Plus, Pencil, Trash2, Phone, UserPlus,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface Employee {
  id: string;
  name: string;
  phone: string;
  role: string;
  active: boolean;
}

interface PontoRecord {
  id: string;
  employeeId: string;
  type: "entrada" | "saida";
  date: string;
  time: string;
  lat: number;
  lng: number;
  withinRadius: boolean;
}

const initialEmployees: Employee[] = [
  { id: "e1", name: "João Pereira", phone: "5511999990001", role: "Instrutor", active: true },
  { id: "e2", name: "Ana Costa", phone: "5511999990002", role: "Recepcionista", active: true },
  { id: "e3", name: "Lucas Lima", phone: "5511999990003", role: "Personal Trainer", active: true },
];

const initialRecords: PontoRecord[] = [
  { id: "1", employeeId: "e1", type: "entrada", date: "2024-12-09", time: "06:02", lat: -23.5505, lng: -46.6333, withinRadius: true },
  { id: "2", employeeId: "e2", type: "entrada", date: "2024-12-09", time: "06:15", lat: -23.5505, lng: -46.6333, withinRadius: true },
  { id: "3", employeeId: "e3", type: "entrada", date: "2024-12-09", time: "08:05", lat: -23.5510, lng: -46.6340, withinRadius: false },
  { id: "4", employeeId: "e1", type: "saida", date: "2024-12-09", time: "14:00", lat: -23.5505, lng: -46.6333, withinRadius: true },
  { id: "5", employeeId: "e2", type: "saida", date: "2024-12-09", time: "14:30", lat: -23.5505, lng: -46.6333, withinRadius: true },
];

export default function PontoPage() {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [records] = useState<PontoRecord[]>(initialRecords);
  const [selectedEmployee, setSelectedEmployee] = useState("Todos");
  const [dateFilter, setDateFilter] = useState("");

  // Employee form state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const getEmployeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? "Desconhecido";

  const filteredRecords = records.filter((r) => {
    if (selectedEmployee !== "Todos" && getEmployeeName(r.employeeId) !== selectedEmployee) return false;
    if (dateFilter && r.date !== dateFilter) return false;
    return true;
  });

  const activeEmployees = employees.filter((e) => e.active);

  const summary = activeEmployees.map((emp) => {
    const empRecords = records.filter((r) => r.employeeId === emp.id);
    const entradas = empRecords.filter((r) => r.type === "entrada").length;
    const saidas = empRecords.filter((r) => r.type === "saida").length;
    const outsideRadius = empRecords.filter((r) => !r.withinRadius).length;
    return { employee: emp.name, entradas, saidas, outsideRadius };
  });

  const openNewEmployee = () => {
    setEditingId(null);
    setFormName("");
    setFormPhone("");
    setFormRole("");
    setDialogOpen(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingId(emp.id);
    setFormName(emp.name);
    setFormPhone(emp.phone);
    setFormRole(emp.role);
    setDialogOpen(true);
  };

  const saveEmployee = () => {
    if (!formName.trim() || !formPhone.trim() || !formRole.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (editingId) {
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === editingId ? { ...e, name: formName.trim(), phone: formPhone.trim(), role: formRole.trim() } : e
        )
      );
      toast.success("Funcionário atualizado");
    } else {
      const newEmp: Employee = {
        id: Date.now().toString(),
        name: formName.trim(),
        phone: formPhone.trim(),
        role: formRole.trim(),
        active: true,
      };
      setEmployees((prev) => [...prev, newEmp]);
      toast.success("Funcionário cadastrado");
    }
    setDialogOpen(false);
  };

  const toggleEmployeeActive = (id: string) => {
    setEmployees((prev) =>
      prev.map((e) => (e.id === id ? { ...e, active: !e.active } : e))
    );
  };

  const deleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    toast.success("Funcionário removido");
  };

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
          <TabsTrigger value="employees" className="gap-1">
            <UserPlus className="h-4 w-4" /> Funcionários
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
                    <SelectItem value="Todos">Todos</SelectItem>
                    {activeEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>
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
                      <TableCell className="font-medium">{getEmployeeName(record.employeeId)}</TableCell>
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

        {/* Funcionários Tab */}
        <TabsContent value="employees" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Funcionários Cadastrados ({employees.length})
              </CardTitle>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1" onClick={openNewEmployee}>
                    <Plus className="h-4 w-4" /> Novo Funcionário
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingId ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>Nome completo</Label>
                      <Input
                        placeholder="Ex: Maria Silva"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>WhatsApp (com DDD)</Label>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="5511999999999"
                          value={formPhone}
                          onChange={(e) => setFormPhone(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Cargo / Função</Label>
                      <Input
                        placeholder="Ex: Instrutor, Recepcionista"
                        value={formRole}
                        onChange={(e) => setFormRole(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancelar</Button>
                    </DialogClose>
                    <Button onClick={saveEmployee}>
                      {editingId ? "Salvar" : "Cadastrar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="font-mono text-sm">{emp.phone}</TableCell>
                      <TableCell>{emp.role}</TableCell>
                      <TableCell>
                        <Badge
                          variant={emp.active ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => toggleEmployeeActive(emp.id)}
                        >
                          {emp.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditEmployee(emp)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteEmployee(emp.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
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
