import { useMemo, useState } from "react";
import { BarChart3, Building2, DollarSign, FileText, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdLogsPeriod, useAds, useAdvertisers, useContracts, useSegments } from "@/hooks/useRadioData";

export default function RadioReports() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: advertisers = [] } = useAdvertisers();
  const { data: contracts = [] } = useContracts();
  const { data: ads = [] } = useAds();
  const { data: segments = [] } = useSegments();
  const { data: periodLogs = [] } = useAdLogsPeriod(startDate, endDate);

  const activeContracts = contracts.filter((c) => c.contract_status === "active");
  const expiringContracts = contracts.filter((c) => {
    const end = new Date(`${c.end_date}T23:59:59`);
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    return c.contract_status === "active" && end <= in30;
  });
  const monthlyRevenue = activeContracts.reduce((sum, c) => sum + Number(c.value_cents || 0), 0) / 100;
  const totalExecutions = periodLogs.filter((l) => l.status === "success").length;

  const execsByAdvertiser = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    periodLogs.forEach((log) => {
      if (log.status !== "success" || !log.advertiser_id) return;
      if (!map.has(log.advertiser_id)) {
        const advertiser = advertisers.find((a) => a.id === log.advertiser_id);
        map.set(log.advertiser_id, { name: advertiser?.company_name || "Desconhecido", count: 0 });
      }
      const prev = map.get(log.advertiser_id)!;
      prev.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [advertisers, periodLogs]);

  const segmentOccupancy = useMemo(() => {
    return segments.map((segment) => {
      const occupied = activeContracts.some((contract) => contract.advertiser?.segment_id === segment.id);
      return { name: segment.name, occupied };
    });
  }, [activeContracts, segments]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm">De:</Label>
          <Input type="date" className="w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Ate:</Label>
          <Input type="date" className="w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><TrendingUp className="mx-auto mb-1 h-5 w-5 text-primary" /><span className="block text-xl font-bold">{totalExecutions}</span><span className="text-xs text-muted-foreground">Execucoes no periodo</span></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><FileText className="mx-auto mb-1 h-5 w-5 text-primary" /><span className="block text-xl font-bold">{activeContracts.length}</span><span className="text-xs text-muted-foreground">Contratos ativos</span></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><DollarSign className="mx-auto mb-1 h-5 w-5 text-primary" /><span className="block text-xl font-bold">R$ {monthlyRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span><span className="text-xs text-muted-foreground">Faturamento ativo</span></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Building2 className="mx-auto mb-1 h-5 w-5 text-muted-foreground" /><span className="block text-xl font-bold">{expiringContracts.length}</span><span className="text-xs text-muted-foreground">A vencer (30 dias)</span></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Execucoes por anunciante
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead className="text-right">Execucoes</TableHead></TableRow></TableHeader>
              <TableBody>
                {!execsByAdvertiser.length ? (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                ) : execsByAdvertiser.map((row, idx) => (
                  <TableRow key={`${row.name}-${idx}`}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right font-mono">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Ocupacao por segmento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {segmentOccupancy.map((row) => (
                <div key={row.name} className="flex items-center justify-between py-1">
                  <span className="text-sm">{row.name}</span>
                  <Badge variant={row.occupied ? "default" : "secondary"}>{row.occupied ? "Ocupado" : "Livre"}</Badge>
                </div>
              ))}
              {!segmentOccupancy.length ? <p className="text-sm text-muted-foreground">Sem segmentos cadastrados.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumo operacional</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {ads.length} anuncios cadastrados, {advertisers.length} anunciantes e {contracts.length} contratos no total.
        </CardContent>
      </Card>
    </div>
  );
}
