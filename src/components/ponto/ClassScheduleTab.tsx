import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Dumbbell } from "lucide-react";
import type { ClassScheduleItem, Employee } from "@/hooks/usePontoData";
import { useClassScheduleMutations } from "@/hooks/usePontoData";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface Props {
  schedule: ClassScheduleItem[];
  employees: Employee[];
}

export default function ClassScheduleTab({ schedule, employees }: Props) {
  const { create, update, remove } = useClassScheduleMutations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDay, setFormDay] = useState("1");
  const [formStart, setFormStart] = useState("07:00");
  const [formEnd, setFormEnd] = useState("08:00");
  const [formClass, setFormClass] = useState("");
  const [formInstructor, setFormInstructor] = useState("");
  const [formCapacity, setFormCapacity] = useState("20");

  const openNew = () => {
    setEditingId(null);
    setFormDay("1");
    setFormStart("07:00");
    setFormEnd("08:00");
    setFormClass("");
    setFormInstructor("");
    setFormCapacity("20");
    setDialogOpen(true);
  };

  const openEdit = (item: ClassScheduleItem) => {
    setEditingId(item.id);
    setFormDay(item.day_of_week.toString());
    setFormStart(item.start_time.slice(0, 5));
    setFormEnd(item.end_time.slice(0, 5));
    setFormClass(item.class_name);
    setFormInstructor(item.instructor_id || "");
    setFormCapacity((item.max_capacity || 20).toString());
    setDialogOpen(true);
  };

  const save = () => {
    if (!formClass.trim()) return;
    const instructorName = employees.find((e) => e.id === formInstructor)?.name || null;
    const payload = {
      day_of_week: parseInt(formDay),
      start_time: formStart,
      end_time: formEnd,
      class_name: formClass.trim(),
      instructor_id: formInstructor || null,
      instructor_name: instructorName,
      max_capacity: parseInt(formCapacity) || 20,
    };
    if (editingId) {
      update.mutate({ id: editingId, ...payload });
    } else {
      create.mutate(payload);
    }
    setDialogOpen(false);
  };

  // Group by day
  const grouped = DAYS.map((dayName, idx) => ({
    day: dayName,
    idx,
    classes: schedule.filter((s) => s.day_of_week === idx && s.active).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  })).filter((g) => g.classes.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Dumbbell className="h-4 w-4" /> Grade Semanal de Aulas
        </h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" onClick={openNew}>
              <Plus className="h-4 w-4" /> Nova Aula
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Aula" : "Nova Aula"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dia da Semana</Label>
                  <Select value={formDay} onValueChange={setFormDay}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d, i) => (
                        <SelectItem key={i} value={i.toString()}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Capacidade</Label>
                  <Input type="number" value={formCapacity} onChange={(e) => setFormCapacity(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Início</Label>
                  <Input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fim</Label>
                  <Input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nome da Aula</Label>
                <Input placeholder="Ex: Spinning, Funcional" value={formClass} onChange={(e) => setFormClass(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Instrutor</Label>
                <Select value={formInstructor} onValueChange={setFormInstructor}>
                  <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {employees.filter((e) => e.active).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
      </div>

      {grouped.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Dumbbell className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Nenhuma aula cadastrada. Clique em "Nova Aula" para começar.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {grouped.map((g) => (
          <Card key={g.idx}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{g.day}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.classes.map((cls) => (
                <div key={cls.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm">
                  <div>
                    <p className="font-medium">{cls.class_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cls.start_time.slice(0, 5)} - {cls.end_time.slice(0, 5)}
                      {cls.instructor_name && ` · ${cls.instructor_name}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cls)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove.mutate(cls.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
