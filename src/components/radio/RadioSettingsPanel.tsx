import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, Loader2 } from "lucide-react";
import { useRadioSettings, useUpdateRadioSettings } from "@/hooks/useRadioData";

export default function RadioSettingsPanel() {
  const { data: settings, isLoading } = useRadioSettings();
  const updateMut = useUpdateRadioSettings();
  const [form, setForm] = useState({
    min_interval_minutes: 5,
    min_same_advertiser_interval_minutes: 15,
    operating_hours_start: "06:00",
    operating_hours_end: "22:00",
    prime_hours_start: "17:00",
    prime_hours_end: "20:00",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        min_interval_minutes: settings.min_interval_minutes,
        min_same_advertiser_interval_minutes: settings.min_same_advertiser_interval_minutes,
        operating_hours_start: settings.operating_hours_start?.substring(0, 5) || "06:00",
        operating_hours_end: settings.operating_hours_end?.substring(0, 5) || "22:00",
        prime_hours_start: settings.prime_hours_start?.substring(0, 5) || "17:00",
        prime_hours_end: settings.prime_hours_end?.substring(0, 5) || "20:00",
      });
    }
  }, [settings]);

  const save = () => {
    if (!settings) return;
    updateMut.mutate({ id: settings.id, ...form });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4" /> Configurações da Rádio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Intervalo mínimo entre anúncios (min)</Label>
            <Input type="number" value={form.min_interval_minutes} onChange={(e) => setForm({ ...form, min_interval_minutes: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Intervalo mínimo mesmo anunciante (min)</Label>
            <Input type="number" value={form.min_same_advertiser_interval_minutes} onChange={(e) => setForm({ ...form, min_same_advertiser_interval_minutes: Number(e.target.value) })} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Abertura</Label><Input type="time" value={form.operating_hours_start} onChange={(e) => setForm({ ...form, operating_hours_start: e.target.value })} /></div>
          <div><Label>Fechamento</Label><Input type="time" value={form.operating_hours_end} onChange={(e) => setForm({ ...form, operating_hours_end: e.target.value })} /></div>
          <div><Label>Horário Nobre Início</Label><Input type="time" value={form.prime_hours_start} onChange={(e) => setForm({ ...form, prime_hours_start: e.target.value })} /></div>
          <div><Label>Horário Nobre Fim</Label><Input type="time" value={form.prime_hours_end} onChange={(e) => setForm({ ...form, prime_hours_end: e.target.value })} /></div>
        </div>
        <Button onClick={save} disabled={updateMut.isPending}>
          {updateMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Salvar Configurações
        </Button>
      </CardContent>
    </Card>
  );
}
