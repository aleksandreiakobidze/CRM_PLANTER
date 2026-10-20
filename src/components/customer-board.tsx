"use client";

import "leaflet/dist/leaflet.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { Pencil } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/server/labels";

const PAGE = 10;

export type CustomerSpot = {
  id: string;
  name: string;
  type: string;
  zone: string;
  phone: string;
  status: string;
  statusTone: BadgeTone;
  lat: number | null;
  lng: number | null;
};

type LeafletApi = typeof import("leaflet");

async function loadLeaflet(): Promise<LeafletApi> {
  const loaded = await import("leaflet");
  const candidate = loaded as LeafletApi & { default?: LeafletApi };
  return typeof candidate.map === "function" ? candidate : candidate.default ?? candidate;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}

export function CustomerBoard({ customers }: { customers: CustomerSpot[] }) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [drawn, setDrawn] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const pages = Math.max(1, Math.ceil(customers.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const start = safePage * PAGE;
  const slice = customers.slice(start, start + PAGE);
  const placed = customers.filter((customer) => customer.lat != null && customer.lng != null);
  const from = customers.length === 0 ? 0 : start + 1;
  const to = start + slice.length;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let map: LeafletMap | null = null;
    let cancelled = false;
    void loadLeaflet().then((leaflet) => {
      if (cancelled || !host.current) return;
      map = leaflet.map(host.current, { scrollWheelZoom: true }).setView([41.7151, 44.8271], 11);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      map.invalidateSize();
      setReady(true);
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.current.clear();
      setReady(false);
    };
  }, []);

  const pointsKey = customers.map((customer) => `${customer.id}:${customer.lat ?? ""}:${customer.lng ?? ""}`).join("|");

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !map || !layer) return;
    let cancelled = false;
    void loadLeaflet().then((leaflet) => {
      if (cancelled || mapRef.current !== map) return;
      layer.clearLayers();
      markers.current.clear();
      const bounds: [number, number][] = [];
      for (const customer of customers) {
        if (customer.lat == null || customer.lng == null) continue;
        const marker = leaflet.marker([customer.lat, customer.lng], {
          title: customer.name,
          icon: leaflet.divIcon({ className: "map-pin", iconSize: [14, 14], iconAnchor: [7, 7] }),
        });
        const detail = [customer.type, customer.zone].filter(Boolean).join(" · ");
        marker.bindPopup(
          `<strong>${escapeHtml(customer.name)}</strong>${detail ? `<div>${escapeHtml(detail)}</div>` : ""}<a href="/crm/customers/${customer.id}">გახსნა</a>`,
        );
        marker.on("click", () => {
          setSelected(customer.id);
          const index = customers.findIndex((item) => item.id === customer.id);
          if (index >= 0) setPage(Math.floor(index / PAGE));
        });
        marker.addTo(layer);
        markers.current.set(customer.id, marker);
        bounds.push([customer.lat, customer.lng]);
      }
      if (bounds.length === 1) map.setView(bounds[0], 14);
      else if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
      setDrawn((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [customers, pointsKey, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let cancelled = false;
    void loadLeaflet().then((leaflet) => {
      if (cancelled) return;
      for (const [id, marker] of markers.current) {
        const on = id === selected;
        marker.setIcon(leaflet.divIcon({
          className: on ? "map-pin on" : "map-pin",
          iconSize: on ? [18, 18] : [14, 14],
          iconAnchor: on ? [9, 9] : [7, 7],
        }));
      }
      const spot = customers.find((customer) => customer.id === selected && customer.lat != null && customer.lng != null);
      if (spot?.lat != null && spot.lng != null) map.flyTo([spot.lat, spot.lng], 15, { duration: 0.55 });
    });
    return () => {
      cancelled = true;
    };
  }, [customers, ready, selected, drawn]);

  function choose(id: string) {
    setSelected(id);
  }

  if (customers.length === 0) return null;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <p className="text-sm tabular-nums text-gray-500 dark:text-gray-400">{from}–{to} / {customers.length}</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="icon" aria-label="წინა ათეული" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft size={18} />
            </Button>
            <Button type="button" variant="secondary" size="icon" aria-label="შემდეგი ათეული" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {slice.map((customer) => (
            <div
              key={customer.id}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5",
                customer.id === selected && "bg-brand-50 dark:bg-brand-500/12",
              )}
            >
              <button
                type="button"
                className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-4 rounded-xl bg-transparent px-2 py-2 text-left font-medium whitespace-normal text-gray-800 hover:bg-gray-50 dark:text-white/90 dark:hover:bg-white/[0.03]"
                aria-pressed={customer.id === selected}
                onClick={() => choose(customer.id)}
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="font-medium">{customer.name}</strong>
                    <Badge variant={customer.statusTone}>{customer.status}</Badge>
                  </span>
                  <small className="text-xs font-normal text-gray-500 dark:text-gray-400">
                    {[customer.type, customer.zone].filter(Boolean).join(" · ") || "—"}
                  </small>
                </span>
                <span className="shrink-0 text-sm font-normal tabular-nums text-gray-500 dark:text-gray-400">{customer.phone}</span>
              </button>
              <Button asChild variant="ghost" size="icon" className="mr-1 size-9 shrink-0 text-gray-500">
                <Link href={`/crm/customers/${customer.id}/edit`} aria-label={`${customer.name} — რედაქტირება`} title="რედაქტირება">
                  <Pencil size={16} />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </Card>
      <Card className="customer-map p-3">
        <div ref={host} />
        <div className="mt-2.5 flex items-center justify-between gap-3 px-1">
          <p className="text-sm tabular-nums text-gray-500 dark:text-gray-400">რუკაზე {placed.length} / {customers.length}</p>
          {selected ? (
            <Link className="text-sm font-medium text-brand-500 hover:text-brand-600" href={`/crm/customers/${selected}`}>
              გახსნა
            </Link>
          ) : null}
        </div>
      </Card>
    </>
  );
}
