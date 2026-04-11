import { useEffect, useState } from "react";
import { Loader2, Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    if (!settings) return;
    setForm({
      min_interval_minutes: settings.min_interval_minutes,
      min_same_advertiser_interval_minutes: settings.min_same_advertiser_interval_minutes,
      operating_hours_start: settings.operating_hours_start?.slice(0, 5) || "06:00",
      operating_hours_end: settings.operating_hours_end?.slice(0, 5) || "22:00",
      prime_hours_start: settings.prime_hours_start?.slice(0, 5) || "17:00",
      prime_hours_end: settings.prime_hours_end?.slice(0, 5) || "20:00",
    });
  }, [settings]);

  const save = async () => {
    await updateMut.mutateAsync({ id: settings?.id || "default", ...form });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4" />
          Configuracoes da radio comercial
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Intervalo minimo entre anuncios (min)</Label>
            <Input type="number" value={form.min_interval_minutes} onChange={(e) => setForm((prev) => ({ ...prev, min_interval_minutes: Number(e.target.value || 1) }))} />
          </div>
          <div>
            <Label>Intervalo minimo mesmo anunciante (min)</Label>
            <Input type="number" value={form.min_same_advertiser_interval_minutes} onChange={(e) => setForm((prev) => ({ ...prev, min_same_advertiser_interval_minutes: Number(e.target.value || 1) }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Label>Abertura</Label>
            <Input type="time" value={form.operating_hours_start} onChange={(e) => setForm((prev) => ({ ...prev, operating_hours_start: e.target.value }))} />
          </div>
          <div>
            <Label>Fechamento</Label>
            <Input type="time" value={form.operating_hours_end} onChange={(e) => setForm((prev) => ({ ...prev, operating_hours_end: e.target.value }))} />
          </div>
          <div>
            <Label>Nobre inicio</Label>
            <Input type="time" value={form.prime_hours_start} onChange={(e) => setForm((prev) => ({ ...prev, prime_hours_start: e.target.value }))} />
          </div>
          <div>
            <Label>Nobre fim</Label>
            <Input type="time" value={form.prime_hours_end} onChange={(e) => setForm((prev) => ({ ...prev, prime_hours_end: e.target.value }))} />
          </div>
        </div>
        <Button onClick={save} disabled={updateMut.isPending}>
          {updateMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Salvar configuracoes
        </Button>
      </CardContent>
    </Card>
  );
}
