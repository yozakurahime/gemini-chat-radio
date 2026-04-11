import { useMemo, useRef, useState } from "react";
import { Edit, Loader2, Megaphone, Play, Plus, Search, Trash2, Upload, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePanelData } from "@/hooks/use-panel-data";
import {
  useAdLibraryFiles,
  useAds,
  useAdvertisers,
  useContracts,
  useCreateAd,
  useDeleteAd,
  useUpdateAd,
  useUploadAdLibraryFile,
} from "@/hooks/useRadioData";

const emptyForm = {
  advertiser_id: "",
  contract_id: "",
  name: "",
  file: "",
  duration_seconds: 30,
  volume: 1,
  status: "pending",
  priority: 0,
  allowed_hours_start: "06:00",
  allowed_hours_end: "23:00",
};

export default function AdsList() {
  const { data: ads = [], isLoading } = useAds();
  const { data: advertisers = [] } = useAdvertisers();
  const { data: contracts = [] } = useContracts();
  const { data: files = [] } = useAdLibraryFiles();
  const createMut = useCreateAd();
  const updateMut = useUpdateAd();
  const deleteMut = useDeleteAd();
  const uploadMut = useUploadAdLibraryFile();
  const { playAdNow } = usePanelData();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [testAudio, setTestAudio] = useState<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ads;
    return ads.filter((a) => `${a.name} ${a.advertiser?.company_name || ""}`.toLowerCase().includes(q));
  }, [ads, search]);

  const advContracts = useMemo(() => {
    if (!form.advertiser_id) return [];
    return contracts.filter((c) => c.advertiser_id === form.advertiser_id && c.contract_status === "active");
  }, [contracts, form.advertiser_id]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (id: string) => {
    const row = ads.find((a) => a.id === id);
    if (!row) return;
    setEditingId(id);
    setForm({
      advertiser_id: row.advertiser_id,
      contract_id: row.contract_id || "",
      name: row.name,
      file: row.file || "",
      duration_seconds: row.duration_seconds,
      volume: Number(row.volume || 1),
      status: row.status,
      priority: row.priority,
      allowed_hours_start: row.allowed_hours_start?.slice(0, 5) || "06:00",
      allowed_hours_end: row.allowed_hours_end?.slice(0, 5) || "23:00",
    });
    setOpen(true);
  };

  const save = async () => {
    const payload = {
      ...form,
      contract_id: form.contract_id || null,
    };
    if (editingId) {
      await updateMut.mutateAsync({ id: editingId, ...payload });
    } else {
      await createMut.mutateAsync(payload as never);
    }
    setOpen(false);
  };

  const playTest = (file: string) => {
    if (!file) return;
    try {
      testAudio?.pause();
      const audio = new Audio(`/ads/${encodeURIComponent(file)}`);
      audio.play().catch(() => {
        toast.error("Falha ao reproduzir audio");
      });
      setTestAudio(audio);
    } catch {
      toast.error("Falha ao reproduzir audio");
    }
  };

  const uploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.mp3$/i.test(file.name)) {
      toast.error("Envie um MP3");
      return;
    }
    await uploadMut.mutateAsync(file);
    if (!form.file) {
      setForm((prev) => ({ ...prev, file: file.name }));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar anuncio..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" />
              Novo anuncio
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar anuncio" : "Novo anuncio"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Anunciante *</Label>
                <Select value={form.advertiser_id} onValueChange={(value) => setForm((prev) => ({ ...prev, advertiser_id: value, contract_id: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {advertisers.filter((a) => a.status === "active").map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {advContracts.length ? (
                <div>
                  <Label>Contrato</Label>
                  <Select value={form.contract_id || "none"} onValueChange={(value) => setForm((prev) => ({ ...prev, contract_id: value === "none" ? "" : value }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem contrato</SelectItem>
                      {advContracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.plan_name} ({c.daily_executions}x/dia)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div>
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Arquivo MP3 *</Label>
                <div className="flex gap-2">
                  <Select value={form.file || "none"} onValueChange={(value) => setForm((prev) => ({ ...prev, file: value === "none" ? "" : value }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione o MP3" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione</SelectItem>
                      {files.map((f) => (
                        <SelectItem key={f.file} value={f.file}>{f.file}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMut.isPending}>
                    {uploadMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </Button>
                </div>
                <input ref={fileInputRef} type="file" accept=".mp3,audio/mpeg" className="hidden" onChange={uploadFile} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Duracao (seg)</Label>
                  <Input type="number" value={form.duration_seconds} onChange={(e) => setForm((prev) => ({ ...prev, duration_seconds: Number(e.target.value || 30) }))} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Usado na grade e nos relatorios. A duracao real e registrada quando o anuncio toca.
                  </p>
                </div>
                <div>
                  <Label>Prioridade</Label>
                  <Input type="number" value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: Number(e.target.value || 0) }))} />
                </div>
              </div>
              <div>
                <Label>Volume ({Math.round(form.volume * 100)}%)</Label>
                <Slider value={[form.volume * 100]} max={100} onValueChange={([v]) => setForm((prev) => ({ ...prev, volume: v / 100 }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Periodo inicio</Label>
                  <Input type="time" value={form.allowed_hours_start} onChange={(e) => setForm((prev) => ({ ...prev, allowed_hours_start: e.target.value }))} />
                </div>
                <div>
                  <Label>Periodo fim</Label>
                  <Input type="time" value={form.allowed_hours_end} onChange={(e) => setForm((prev) => ({ ...prev, allowed_hours_end: e.target.value }))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                As execucoes por dia do contrato serao distribuidas automaticamente dentro desse periodo.
              </p>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={save} disabled={!form.advertiser_id || !form.name.trim() || !form.file || createMut.isPending || updateMut.isPending}>
                {editingId ? "Salvar" : "Criar anuncio"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4" />
            Anuncios ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Duracao</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : !filtered.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum anuncio</TableCell></TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.advertiser?.company_name || "-"}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs">{row.file}</TableCell>
                      <TableCell>{row.duration_seconds}s</TableCell>
                      <TableCell><Volume2 className="mr-1 inline h-3 w-3" />{Math.round(Number(row.volume || 1) * 100)}%</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "active" ? "default" : "secondary"}>
                          {row.status === "active" ? "Ativo" : row.status === "pending" ? "Pendente" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => playTest(row.file)}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void playAdNow({ file: row.file, name: row.name, campaignId: row.campaign_id ? Number(row.campaign_id) : null, source: "manual" })}>
                            <Play className="h-3.5 w-3.5 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row.id)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMut.mutate(row.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
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
