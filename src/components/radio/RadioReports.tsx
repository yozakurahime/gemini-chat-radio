import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Building2, DollarSign, FileText, TrendingUp } from "lucide-react";
import { useAdvertisers, useContracts, useAds, useSegments } from "@/hooks/useRadioData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function RadioReports() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: advertisers = [] } = useAdvertisers();
  const { data: contracts = [] } = useContracts();
  const { data: ads = [] } = useAds();
  const { data: segments = [] } = useSegments();

  // Fetch logs for period
  const { data: periodLogs = [] } = useQuery({
    queryKey: ["ad-logs-period", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_execution_logs")
        .select("*")
        .gte("played_at", `${startDate}T00:00:00`)
        .lte("played_at", `${endDate}T23:59:59`)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Stats
  const activeContracts = contracts.filter((c) => c.contract_status === "active");
  const expiringContracts = contracts.filter((c) => {
    const end = new Date(c.end_date);
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    return c.contract_status === "active" && end <= in30;
  });
  const monthlyRevenue = activeContracts.reduce((s, c) => s + c.value_cents, 0) / 100;
  const totalExecutions = periodLogs.filter((l) => l.status === "success").length;

  // Executions per advertiser
  const execsByAdvertiser = useMemo(() => {
    const map: Record<string, { name: string; count: number }> = {};
    for (const log of periodLogs) {
      if (log.status !== "success" || !log.advertiser_id) continue;
      if (!map[log.advertiser_id]) {
        const adv = advertisers.find((a) => a.id === log.advertiser_id);
        map[log.advertiser_id] = { name: adv?.company_name || "Desconhecido", count: 0 };
      }
      map[log.advertiser_id].count++;
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [periodLogs, advertisers]);

  // Segment occupancy
  const segmentOccupancy = useMemo(() => {
    return segments.map((seg) => {
      const occupied = activeContracts.some((c) => c.advertiser?.segment_id === seg.id);
      return { name: seg.name, occupied };
    });
  }, [segments, activeContracts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm">De:</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Até:</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-primary mb-1" />
            <span className="text-xl font-bold block">{totalExecutions}</span>
            <span className="text-xs text-muted-foreground">Execuções no período</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-5 w-5 mx-auto text-primary mb-1" />
            <span className="text-xl font-bold block">{activeContracts.length}</span>
            <span className="text-xs text-muted-foreground">Contratos ativos</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
            <span className="text-xl font-bold block">R$ {monthlyRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            <span className="text-xs text-muted-foreground">Faturamento ativo</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Building2 className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <span className="text-xl font-bold block">{expiringContracts.length}</span>
            <span className="text-xs text-muted-foreground">A vencer (30 dias)</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Executions by advertiser */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Execuções por Anunciante</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Execuções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {execsByAdvertiser.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                ) : (
                  execsByAdvertiser.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.name}</TableCell>
                      <TableCell className="text-right font-mono">{e.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Segment occupancy */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Ocupação Comercial por Segmento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {segmentOccupancy.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-sm">{s.name}</span>
                  <Badge variant={s.occupied ? "default" : "secondary"}>{s.occupied ? "Ocupado" : "Livre"}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
