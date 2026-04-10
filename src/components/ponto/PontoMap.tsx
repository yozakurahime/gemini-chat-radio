import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { useAcademySettings } from "@/hooks/usePontoData";
import type { PontoRecord, Employee } from "@/hooks/usePontoData";
import "leaflet/dist/leaflet.css";

interface PontoMapProps {
  records: PontoRecord[];
  employees: Employee[];
}

export default function PontoMap({ records, employees }: PontoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const { data: settings } = useAcademySettings();

  const getEmployeeName = (id: string) =>
    employees.find((e) => e.id === id)?.name ?? "Desconhecido";

  useEffect(() => {
    if (!mapRef.current || !settings) return;

    const initMap = async () => {
      const L = await import("leaflet");

      // Fix default icon
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      const map = L.map(mapRef.current!).setView([settings.lat, settings.lng], 16);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // Academy radius circle
      L.circle([settings.lat, settings.lng], {
        radius: settings.radius_meters,
        color: "hsl(var(--primary))",
        fillColor: "hsl(var(--primary))",
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);

      // Academy center marker
      L.marker([settings.lat, settings.lng], {
        icon: L.divIcon({
          className: "custom-marker",
          html: `<div style="background:hsl(var(--primary));width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      })
        .addTo(map)
        .bindPopup(`<b>${settings.academy_name}</b><br/>Raio: ${settings.radius_meters}m`);

      // Employee markers
      const recordsWithLocation = records.filter((r) => r.lat && r.lng);
      recordsWithLocation.forEach((record) => {
        const color = record.within_radius ? "#22c55e" : "#ef4444";
        L.marker([record.lat!, record.lng!], {
          icon: L.divIcon({
            className: "custom-marker",
            html: `<div style="background:${color};width:10px;height:10px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
            iconSize: [10, 10],
            iconAnchor: [5, 5],
          }),
        })
          .addTo(map)
          .bindPopup(
            `<b>${getEmployeeName(record.employee_id)}</b><br/>${record.type === "entrada" ? "Entrada" : "Saída"} - ${record.time}<br/>${record.within_radius ? "✅ No raio" : "❌ Fora do raio"}`
          );
      });

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [settings, records, employees]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Mapa de Localização
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={mapRef} className="h-80 rounded-lg overflow-hidden" />
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-primary" /> Academia
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#22c55e" }} /> No raio
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: "#ef4444" }} /> Fora do raio
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
