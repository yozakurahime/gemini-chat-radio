import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, FileText, Search, AlertTriangle } from "lucide-react";
import { useContracts, useCreateContract, useUpdateContract, useAdvertisers, useSegments } from "@/hooks/useRadioData";
import { format } from "date-fns";
import { toast } from "sonner";

const statusLabels: Record<string, string> = { active: "Ativo", paused: "Pausado", expired: "Vencido", cancelled: "Cancelado" };
const paymentLabels: Record<string, string> = { paid: "Pago", pending: "Pendente", overdue: "Inadimplente" };
const statusColors: Record<string, "default" | "secondary" | "destructive"> = { active: "default", paused: "secondary", expired: "destructive", cancelled: "destructive" };
const paymentColors: Record<string, "default" | "secondary" | "destructive"> = { paid: "default", pending: "secondary", overdue: "destructive" };

const defaultForm = {
  advertiser_id: "", plan_name: "Padrão", value_cents: 0, start_date: "", end_date: "",
  daily_executions: 3, ad_duration_seconds: 30, contract_status: "active", payment_status: "paid",
  segment_exclusive: true, notes: "",
};

export default function ContractsList() {
  const { data: contracts = [], isLoading } = useContracts();
  const { data: advertisers = [] } = useAdvertisers();
  const { data: segments = [] } = useSegments();
  const createMut = useCreateContract();
  const updateMut = useUpdateContract();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);

  const filtered = contracts.filter((c) =>
    c.advertiser?.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.plan_name.toLowerCase().includes(search.toLowerCase())
  );

  const checkSegmentConflict = (advertiserId: string, exclusive: boolean): boolean => {
    if (!exclusive) return false;
    const adv = advertisers.find((a) => a.id === advertiserId);
    if (!adv?.segment_id) return false;
    return contracts.some(
      (c) =>
        c.id !== editing?.id &&
        c.contract_status === "active" &&
        c.segment_exclusive &&
        c.advertiser?.segment_id === adv.segment_id &&
        c.advertiser_id !== advertiserId
    );
  };

  const openNew = () => { setEditing(null); setForm(defaultForm); setOpen(true); };
  const openEdit = (c: any) => {
    setEditing(c);
    setForm({
      advertiser_id: c.advertiser_id, plan_name: c.plan_name, value_cents: c.value_cents,
      start_date: c.start_date, end_date: c.end_date, daily_executions: c.daily_executions,
      ad_duration_seconds: c.ad_duration_seconds, contract_status: c.contract_status,
      payment_status: c.payment_status, segment_exclusive: c.segment_exclusive, notes: c.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (checkSegmentConflict(form.advertiser_id, form.segment_exclusive)) {
      toast.error("Conflito de segmento! Já existe um anunciante ativo neste segmento com exclusividade.");
      return;
    }
    const payload = { ...form, notes: form.notes || null };
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMut.mutateAsync(payload as any);
    }
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar contrato..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Contrato</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar Contrato" : "Novo Contrato"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Anunciante *</Label>
                <Select value={form.advertiser_id} onValueChange={(v) => setForm({ ...form, advertiser_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{advertisers.filter((a) => a.status === "active").map((a) => <SelectItem key={a.id} value={a.id}>{a.company_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {form.advertiser_id && form.segment_exclusive && checkSegmentConflict(form.advertiser_id, true) && (
                <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Conflito de segmento detectado!
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Plano</Label><Input value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })} /></div>
                <div><Label>Valor (R$)</Label><Input type="number" step="0.01" value={(form.value_cents / 100).toFixed(2)} onChange={(e) => setForm({ ...form, value_cents: Math.round(Number(e.target.value) * 100) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Início *</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>Término *</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Execuções/dia</Label><Input type="number" value={form.daily_executions} onChange={(e) => setForm({ ...form, daily_executions: Number(e.target.value) })} /></div>
                <div><Label>Duração (seg)</Label><Input type="number" value={form.ad_duration_seconds} onChange={(e) => setForm({ ...form, ad_duration_seconds: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={form.contract_status} onValueChange={(v) => setForm({ ...form, contract_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="paused">Pausado</SelectItem>
                      <SelectItem value="expired">Vencido</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pagamento</Label>
                  <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="overdue">Inadimplente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.segment_exclusive} onCheckedChange={(v) => setForm({ ...form, segment_exclusive: v })} />
                <Label>Exclusividade por segmento</Label>
              </div>
              <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={save} className="w-full" disabled={!form.advertiser_id || !form.start_date || !form.end_date || createMut.isPending || updateMut.isPending}>
                {editing ? "Salvar" : "Criar Contrato"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Contratos ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Exec/dia</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Excl.</TableHead>
                  <TableHead className="w-16">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhum contrato</TableCell></TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.advertiser?.company_name || "—"}</TableCell>
                      <TableCell>{c.plan_name}</TableCell>
                      <TableCell>R$ {(c.value_cents / 100).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{format(new Date(c.start_date), "dd/MM/yy")} - {format(new Date(c.end_date), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-center">{c.daily_executions}</TableCell>
                      <TableCell><Badge variant={statusColors[c.contract_status]}>{statusLabels[c.contract_status]}</Badge></TableCell>
                      <TableCell><Badge variant={paymentColors[c.payment_status]}>{paymentLabels[c.payment_status]}</Badge></TableCell>
                      <TableCell>{c.segment_exclusive ? "✓" : "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                      </TableCell>
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
