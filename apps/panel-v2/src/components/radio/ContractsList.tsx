import { useMemo, useState } from "react";
import { AlertTriangle, Edit, FileText, Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAdvertisers, useContracts, useCreateContract, useUpdateContract } from "@/hooks/useRadioData";

const statusLabel: Record<string, string> = { active: "Ativo", paused: "Pausado", expired: "Vencido", cancelled: "Cancelado" };
const paymentLabel: Record<string, string> = { paid: "Pago", pending: "Pendente", overdue: "Inadimplente" };

const emptyForm = {
  advertiser_id: "",
  plan_name: "Padrao",
  value_cents: 0,
  start_date: "",
  end_date: "",
  daily_executions: 3,
  ad_duration_seconds: 30,
  contract_status: "active",
  payment_status: "paid",
  segment_exclusive: true,
  notes: "",
};

export default function ContractsList() {
  const { data: contracts = [], isLoading } = useContracts();
  const { data: advertisers = [] } = useAdvertisers();
  const createMut = useCreateContract();
  const updateMut = useUpdateContract();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) => `${c.plan_name} ${c.advertiser?.company_name || ""}`.toLowerCase().includes(q));
  }, [contracts, search]);

  const hasSegmentConflict = (advertiserId: string, exclusive: boolean) => {
    if (!exclusive || !advertiserId) return false;
    const advertiser = advertisers.find((a) => a.id === advertiserId);
    if (!advertiser?.segment_id) return false;
    return contracts.some((contract) => (
      contract.id !== editingId &&
      contract.contract_status === "active" &&
      contract.segment_exclusive &&
      contract.payment_status !== "overdue" &&
      contract.advertiser?.segment_id === advertiser.segment_id &&
      contract.advertiser_id !== advertiserId
    ));
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (id: string) => {
    const row = contracts.find((c) => c.id === id);
    if (!row) return;
    setEditingId(id);
    setForm({
      advertiser_id: row.advertiser_id,
      plan_name: row.plan_name,
      value_cents: row.value_cents,
      start_date: row.start_date,
      end_date: row.end_date,
      daily_executions: row.daily_executions,
      ad_duration_seconds: row.ad_duration_seconds,
      contract_status: row.contract_status,
      payment_status: row.payment_status,
      segment_exclusive: !!row.segment_exclusive,
      notes: row.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (hasSegmentConflict(form.advertiser_id, form.segment_exclusive)) {
      toast.error("Conflito de segmento com exclusividade.");
      return;
    }
    if (editingId) {
      await updateMut.mutateAsync({ id: editingId, ...form });
    } else {
      await createMut.mutateAsync(form as never);
    }
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar contrato..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" />
              Novo contrato
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar contrato" : "Novo contrato"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Anunciante *</Label>
                <Select value={form.advertiser_id} onValueChange={(value) => setForm((prev) => ({ ...prev, advertiser_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {advertisers.filter((a) => a.status === "active").map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasSegmentConflict(form.advertiser_id, form.segment_exclusive) ? (
                <div className="flex items-center gap-2 rounded bg-destructive/10 p-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Segmento em conflito por exclusividade.
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Plano</Label>
                  <Input value={form.plan_name} onChange={(e) => setForm((prev) => ({ ...prev, plan_name: e.target.value }))} />
                </div>
                <div>
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(form.value_cents / 100).toFixed(2)}
                    onChange={(e) => setForm((prev) => ({ ...prev, value_cents: Math.round(Number(e.target.value || 0) * 100) }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Inicio *</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} />
                </div>
                <div>
                  <Label>Fim *</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Execucoes/dia</Label>
                  <Input type="number" value={form.daily_executions} onChange={(e) => setForm((prev) => ({ ...prev, daily_executions: Number(e.target.value || 1) }))} />
                </div>
                <div>
                  <Label>Duracao (seg)</Label>
                  <Input type="number" value={form.ad_duration_seconds} onChange={(e) => setForm((prev) => ({ ...prev, ad_duration_seconds: Number(e.target.value || 30) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Status</Label>
                  <Select value={form.contract_status} onValueChange={(value) => setForm((prev) => ({ ...prev, contract_status: value }))}>
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
                  <Select value={form.payment_status} onValueChange={(value) => setForm((prev) => ({ ...prev, payment_status: value }))}>
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
                <Switch checked={form.segment_exclusive} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, segment_exclusive: checked }))} />
                <Label>Exclusividade por segmento</Label>
              </div>
              <div>
                <Label>Observacoes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={save} disabled={!form.advertiser_id || !form.start_date || !form.end_date || createMut.isPending || updateMut.isPending}>
                {editingId ? "Salvar" : "Criar contrato"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Contratos ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Exec/dia</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Excl.</TableHead>
                  <TableHead className="w-16">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : !filtered.length ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhum contrato</TableCell></TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.advertiser?.company_name || "-"}</TableCell>
                      <TableCell>{row.plan_name}</TableCell>
                      <TableCell>R$ {(Number(row.value_cents || 0) / 100).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(`${row.start_date}T12:00:00`), "dd/MM/yy")} - {format(new Date(`${row.end_date}T12:00:00`), "dd/MM/yy")}
                      </TableCell>
                      <TableCell className="text-center">{row.daily_executions}</TableCell>
                      <TableCell><Badge variant={row.contract_status === "active" ? "default" : "secondary"}>{statusLabel[row.contract_status] || row.contract_status}</Badge></TableCell>
                      <TableCell><Badge variant={row.payment_status === "overdue" ? "destructive" : row.payment_status === "paid" ? "default" : "secondary"}>{paymentLabel[row.payment_status] || row.payment_status}</Badge></TableCell>
                      <TableCell>{row.segment_exclusive ? "SIM" : "-"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row.id)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
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
