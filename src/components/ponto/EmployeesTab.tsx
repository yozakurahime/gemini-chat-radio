import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { User, Plus, Pencil, Trash2, Phone } from "lucide-react";
import type { Employee } from "@/hooks/usePontoData";
import { useEmployeeMutations } from "@/hooks/usePontoData";

interface Props {
  employees: Employee[];
}

export default function EmployeesTab({ employees }: Props) {
  const { create, update, toggleActive, remove } = useEmployeeMutations();
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openNew = () => {
    setEditingId(null);
    setFormName("");
    setFormPhone("");
    setFormRole("");
    setDialogOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setFormName(emp.name);
    setFormPhone(emp.phone);
    setFormRole(emp.role);
    setDialogOpen(true);
  };

  const save = () => {
    if (!formName.trim() || !formPhone.trim() || !formRole.trim()) return;
    if (editingId) {
      update.mutate({ id: editingId, name: formName.trim(), phone: formPhone.trim(), role: formRole.trim() });
    } else {
      create.mutate({ name: formName.trim(), phone: formPhone.trim(), role: formRole.trim() });
    }
    setDialogOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" /> Funcionários ({employees.length})
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" onClick={openNew}>
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input placeholder="Ex: Maria Silva" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp (com DDD)</Label>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <Input placeholder="5511999999999" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cargo / Função</Label>
                <Input placeholder="Ex: Instrutor" value={formRole} onChange={(e) => setFormRole(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button onClick={save}>{editingId ? "Salvar" : "Cadastrar"}</Button>
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
                    onClick={() => toggleActive.mutate({ id: emp.id, active: !emp.active })}
                  >
                    {emp.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(emp)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove.mutate(emp.id)}>
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
  );
}
