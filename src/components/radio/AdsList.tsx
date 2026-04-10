import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Megaphone, Search, Play, Volume2 } from "lucide-react";
import { useAds, useCreateAd, useUpdateAd, useDeleteAd, useAdvertisers, useContracts } from "@/hooks/useRadioData";

const statusLabels: Record<string, string> = { active: "Ativo", inactive: "Inativo", pending: "Pendente" };
const statusColors: Record<string, "default" | "secondary" | "destructive"> = { active: "default", inactive: "secondary", pending: "secondary" };

const defaultForm = {
  advertiser_id: "", contract_id: "", name: "", audio_url: "", duration_seconds: 30,
  volume: 1.0, status: "pending", priority: 0, allowed_hours_start: "06:00", allowed_hours_end: "23:00",
};

export default function AdsList() {
  const { data: ads = [], isLoading } = useAds();
  const { data: advertisers = [] } = useAdvertisers();
  const { data: contracts = [] } = useContracts();
  const createMut = useCreateAd();
  const updateMut = useUpdateAd();
  const deleteMut = useDeleteAd();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(defaultForm);
  const [testAudio, setTestAudio] = useState<HTMLAudioElement | null>(null);

  const filtered = ads.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.advertiser?.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditing(null); setForm(defaultForm); setOpen(true); };
  const openEdit = (a: any) => {
    setEditing(a);
    setForm({
      advertiser_id: a.advertiser_id, contract_id: a.contract_id || "", name: a.name,
      audio_url: a.audio_url || "", duration_seconds: a.duration_seconds, volume: a.volume,
      status: a.status, priority: a.priority, allowed_hours_start: a.allowed_hours_start?.substring(0, 5) || "06:00",
      allowed_hours_end: a.allowed_hours_end?.substring(0, 5) || "23:00",
    });
    setOpen(true);
  };

  const save = async () => {
    const payload = {
      ...form,
      contract_id: form.contract_id || null,
      audio_url: form.audio_url || null,
      approved_at: form.status === "active" && !editing?.approved_at ? new Date().toISOString() : editing?.approved_at || null,
    };
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMut.mutateAsync(payload as any);
    }
    setOpen(false);
  };

  const playTest = (url: string) => {
    if (testAudio) { testAudio.pause(); }
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(() => {});
    setTestAudio(audio);
  };

  const advContracts = form.advertiser_id
    ? contracts.filter((c) => c.advertiser_id === form.advertiser_id && c.contract_status === "active")
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar anúncio..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Anúncio</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar Anúncio" : "Novo Anúncio"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Anunciante *</Label>
                <Select value={form.advertiser_id} onValueChange={(v) => setForm({ ...form, advertiser_id: v, contract_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{advertisers.filter((a) => a.status === "active").map((a) => <SelectItem key={a.id} value={a.id}>{a.company_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {advContracts.length > 0 && (
                <div>
                  <Label>Contrato</Label>
                  <Select value={form.contract_id} onValueChange={(v) => setForm({ ...form, contract_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{advContracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.plan_name} ({c.daily_executions}x/dia)</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Nome do Anúncio *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>URL do Áudio</Label>
                <div className="flex gap-2">
                  <Input value={form.audio_url} onChange={(e) => setForm({ ...form, audio_url: e.target.value })} placeholder="https://..." className="flex-1" />
                  {form.audio_url && <Button variant="outline" size="icon" onClick={() => playTest(form.audio_url)}><Play className="h-4 w-4" /></Button>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Duração (seg)</Label><Input type="number" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })} /></div>
                <div><Label>Prioridade</Label><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></div>
              </div>
              <div>
                <Label>Volume ({Math.round(form.volume * 100)}%)</Label>
                <Slider value={[form.volume * 100]} onValueChange={([v]) => setForm({ ...form, volume: v / 100 })} max={100} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Horário Início</Label><Input type="time" value={form.allowed_hours_start} onChange={(e) => setForm({ ...form, allowed_hours_start: e.target.value })} /></div>
                <div><Label>Horário Fim</Label><Input type="time" value={form.allowed_hours_end} onChange={(e) => setForm({ ...form, allowed_hours_end: e.target.value })} /></div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={save} className="w-full" disabled={!form.advertiser_id || !form.name || createMut.isPending || updateMut.isPending}>
                {editing ? "Salvar" : "Criar Anúncio"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4" /> Anúncios ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Vol.</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum anúncio</TableCell></TableRow>
                ) : (
                  filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.advertiser?.company_name || "—"}</TableCell>
                      <TableCell>{a.duration_seconds}s</TableCell>
                      <TableCell><Volume2 className="h-3 w-3 inline mr-1" />{Math.round(Number(a.volume) * 100)}%</TableCell>
                      <TableCell className="text-xs font-mono">{a.allowed_hours_start?.substring(0, 5)}-{a.allowed_hours_end?.substring(0, 5)}</TableCell>
                      <TableCell className="text-center">{a.priority}</TableCell>
                      <TableCell><Badge variant={statusColors[a.status]}>{statusLabels[a.status]}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {a.audio_url && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => playTest(a.audio_url!)}><Play className="h-3.5 w-3.5" /></Button>}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Edit className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMut.mutate(a.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
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
