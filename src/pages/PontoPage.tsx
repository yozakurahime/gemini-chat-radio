import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Download, Calendar, User, MapPin, UserPlus, Dumbbell } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEmployees, usePontoRecords, useAcademySettings, useClassSchedule } from "@/hooks/usePontoData";
import RecordsTab from "@/components/ponto/RecordsTab";
import EmployeesTab from "@/components/ponto/EmployeesTab";
import PontoMap from "@/components/ponto/PontoMap";
import ClassScheduleTab from "@/components/ponto/ClassScheduleTab";

export default function PontoPage() {
  const { data: employees = [] } = useEmployees();
  const { data: records = [] } = usePontoRecords();
  const { data: settings } = useAcademySettings();
  const { data: schedule = [] } = useClassSchedule();

  const [selectedEmployee, setSelectedEmployee] = useState("Todos");
  const [dateFilter, setDateFilter] = useState("");

  const activeEmployees = employees.filter((e) => e.active);

  const summary = activeEmployees.map((emp) => {
    const empRecords = records.filter((r) => r.employee_id === emp.id);
    const entradas = empRecords.filter((r) => r.type === "entrada").length;
    const saidas = empRecords.filter((r) => r.type === "saida").length;
    const outsideRadius = empRecords.filter((r) => !r.within_radius && r.lat).length;
    return { employee: emp.name, entradas, saidas, outsideRadius };
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Sistema de Ponto</h1>
        </div>
        <Button variant="outline" className="gap-1">
          <Download className="h-4 w-4" /> Exportar
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
          <TabsTrigger value="schedule" className="gap-1">
            <Dumbbell className="h-4 w-4" /> Grade de Aulas
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1">
            <MapPin className="h-4 w-4" /> Mapa
          </TabsTrigger>
        </TabsList>

        <TabsContent value="records">
          <RecordsTab
            records={records}
            employees={employees}
            selectedEmployee={selectedEmployee}
            setSelectedEmployee={setSelectedEmployee}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
          />
        </TabsContent>

        <TabsContent value="employees">
          <EmployeesTab employees={employees} />
        </TabsContent>

        <TabsContent value="schedule">
          <ClassScheduleTab schedule={schedule} employees={employees} />
        </TabsContent>

        <TabsContent value="map">
          <PontoMap records={records} employees={employees} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
