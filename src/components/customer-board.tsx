"use client";

import "leaflet/dist/leaflet.css";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, List, Map as MapIcon, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { Pencil } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/server/labels";

const WIDE_QUERY = "(min-width: 1280px)";
const STORE_KEY = "planter.customers.map";

type Sort = "name" | "priority" | "status" | "next";

export type CustomerRow = {
  id: string;
  name: string;
  type: string;
  place: string;
  phone: string;
  tel: string;
  status: string;
  statusTone: BadgeTone;
  priority: string;
  priorityColor: string;
  next: string;
  overdue: boolean;
  mapped: boolean;
};

export type CustomerPoint = {
  id: string;
  name: string;
  type: string;
  zone: string;
  lat: number;
  lng: number;
};

const SORT_LABEL: Record<Sort, string> = {
  name: "სახელი",
  priority: "პრიორიტეტი",
  status: "სტატუსი",
  next: "შემდეგი კონტაქტი",
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

function storeKey(wide: boolean) {
  return `${STORE_KEY}.${wide ? "wide" : "narrow"}`;
}

export function CustomerBoard({
  rows,
  points,
  found,
  from,
  to,
  prevHref,
  nextHref,
  sort,
  dir,
  sortLinks,
}: {
  rows: CustomerRow[];
  points: CustomerPoint[];
  found: number;
  from: number;
  to: number;
  prevHref: string | null;
  nextHref: string | null;
  sort: Sort;
  dir: "asc" | "desc";
  sortLinks: Record<Sort, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [ready, setReady] = useState(false);
  const [drawn, setDrawn] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const fitted = useRef(false);
  const boundsRef = useRef<[number, number][]>([]);

  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const sync = () => {
      setWide(media.matches);
      const saved = window.localStorage.getItem(storeKey(media.matches));
      setShowMap(saved ? saved === "1" : media.matches);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

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

  function fit(map: LeafletMap) {
    const inGeorgia = boundsRef.current.filter(([lat, lng]) => lat > 40.9 && lat < 43.7 && lng > 39.9 && lng < 46.8);
    const bounds = inGeorgia.length ? inGeorgia : boundsRef.current;
    if (!host.current?.offsetWidth) return;
    map.invalidateSize();
    if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    fitted.current = true;
  }

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
      for (const point of points) {
        const marker = leaflet.marker([point.lat, point.lng], {
          title: point.name,
          icon: leaflet.divIcon({ className: "map-pin", iconSize: [14, 14], iconAnchor: [7, 7] }),
        });
        const detail = [point.type, point.zone].filter(Boolean).join(" · ");
        marker.bindPopup(
          `<strong>${escapeHtml(point.name)}</strong>${detail ? `<div>${escapeHtml(detail)}</div>` : ""}<a href="/crm/customers/${point.id}">გახსნა</a>`,
        );
        marker.on("click", () => {
          setSelected(point.id);
          document.getElementById(`customer-row-${point.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
        marker.addTo(layer);
        markers.current.set(point.id, marker);
        bounds.push([point.lat, point.lng]);
      }
      boundsRef.current = bounds;
      fitted.current = false;
      fit(map);
      setDrawn((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [points, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !showMap) return;
    const frame = window.requestAnimationFrame(() => {
      if (!fitted.current) fit(map);
      else map.invalidateSize();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, showMap, wide]);

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
        if (on) marker.setZIndexOffset(1000);
        else marker.setZIndexOffset(0);
      }
      const spot = points.find((point) => point.id === selected);
      if (spot && host.current?.offsetWidth) {
        map.invalidateSize();
        map.flyTo([spot.lat, spot.lng], 15, { duration: 0.55 });
        markers.current.get(spot.id)?.openPopup();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [points, ready, selected, drawn, showMap]);

  function changeMap(next: boolean) {
    setShowMap(next);
    window.localStorage.setItem(storeKey(wide), next ? "1" : "0");
  }

  function locate(id: string) {
    setSelected(id);
    if (!showMap) changeMap(true);
  }

  function openRow(event: React.MouseEvent<HTMLElement>, id: string) {
    if ((event.target as HTMLElement).closest("a, button")) return;
    if (event.metaKey || event.ctrlKey) {
      window.open(`/crm/customers/${id}`, "_blank");
      return;
    }
    router.push(`/crm/customers/${id}`);
  }

  const pager = (
    <div className="customer-pager">
      <span className="tabular-nums">{from}–{to} / {found}</span>
      {prevHref ? (
        <Button asChild variant="secondary" size="icon" className="size-9">
          <Link href={prevHref} aria-label="წინა გვერდი"><ChevronLeft size={18} /></Link>
        </Button>
      ) : (
        <Button type="button" variant="secondary" size="icon" className="size-9" disabled aria-label="წინა გვერდი"><ChevronLeft size={18} /></Button>
      )}
      {nextHref ? (
        <Button asChild variant="secondary" size="icon" className="size-9">
          <Link href={nextHref} aria-label="შემდეგი გვერდი"><ChevronRight size={18} /></Link>
        </Button>
      ) : (
        <Button type="button" variant="secondary" size="icon" className="size-9" disabled aria-label="შემდეგი გვერდი"><ChevronRight size={18} /></Button>
      )}
    </div>
  );

  function head(key: Sort, label = SORT_LABEL[key]) {
    const on = sort === key;
    const Icon = on ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined}>
        <Link href={sortLinks[key]} className={cn("customer-sort", on && "on")} title={SORT_LABEL[key]}>
          {label}
          <Icon size={14} aria-hidden />
        </Link>
      </th>
    );
  }

  return (
    <div className={cn("customer-board", showMap && "with-map")}>
      <div className="customer-board-bar">
        <label className="customer-sort-select">
          <span className="customer-sort-caption">დალაგება</span>
          <select
            value={sort}
            onChange={(event) => router.push(sortLinks[event.target.value as Sort])}
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((key) => (
              <option key={key} value={key}>{SORT_LABEL[key]}</option>
            ))}
          </select>
        </label>
        <div className="customer-view-toggle" role="group" aria-label="ხედი">
          {wide ? (
            <Button type="button" variant="secondary" size="sm" aria-pressed={showMap} onClick={() => changeMap(!showMap)}>
              <MapIcon size={16} aria-hidden />
              {showMap ? "რუკის დამალვა" : "რუკის ჩვენება"}
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" size="sm" className={cn(!showMap && "on")} aria-pressed={!showMap} onClick={() => changeMap(false)}>
                <List size={16} aria-hidden />
                სია
              </Button>
              <Button type="button" variant="secondary" size="sm" className={cn(showMap && "on")} aria-pressed={showMap} onClick={() => changeMap(true)}>
                <MapIcon size={16} aria-hidden />
                რუკა
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="customer-list-card overflow-hidden">
        <div className="customer-list-head">{pager}</div>
        <table className="customer-table">
          <thead>
            <tr>
              {head("name")}
              <th className="col-place">ზონა / ქალაქი</th>
              <th>ტელეფონი</th>
              {head("status")}
              {head("next", "კონტაქტი")}
              <th className="w-0"><span className="sr-only">მოქმედება</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                id={`customer-row-${row.id}`}
                className={cn(row.id === selected && "on")}
                onClick={(event) => openRow(event, row.id)}
              >
                <td className="customer-name-cell">
                  <span className="customer-name-line">
                    {row.priority ? <span className="customer-priority" style={{ color: row.priorityColor, borderColor: row.priorityColor }} title={`პრიორიტეტი ${row.priority}`}>{row.priority}</span> : null}
                    <Link href={`/crm/customers/${row.id}`} className="customer-name">{row.name}</Link>
                  </span>
                  <small>{row.type || "—"}{row.place ? <span className="place-inline"> · {row.place}</span> : null}</small>
                </td>
                <td className="col-place text-gray-600 dark:text-gray-300">{row.place || "—"}</td>
                <td className="customer-phone-cell tabular-nums">
                  {row.tel ? <a href={`tel:${row.tel}`} className="customer-tel">{row.phone}</a> : <span className="text-gray-400">—</span>}
                </td>
                <td><Badge variant={row.statusTone}>{row.status}</Badge></td>
                <td className={cn("whitespace-nowrap tabular-nums", row.overdue ? "font-medium text-error-600 dark:text-error-500" : "text-gray-600 dark:text-gray-300")}>
                  {row.next || <span className="text-gray-400">—</span>}
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 text-gray-500"
                      disabled={!row.mapped}
                      aria-label={`${row.name} — რუკაზე ჩვენება`}
                      title={row.mapped ? "რუკაზე ჩვენება" : "კოორდინატი არ არის"}
                      onClick={() => locate(row.id)}
                    >
                      <MapPin size={16} />
                    </Button>
                    <Button asChild variant="ghost" size="icon" className="size-9 text-gray-500">
                      <Link href={`/crm/customers/${row.id}/edit`} aria-label={`${row.name} — რედაქტირება`} title="რედაქტირება">
                        <Pencil size={16} />
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="customer-cards">
          {rows.map((row) => (
            <li key={row.id} className={cn(row.id === selected && "on")}>
              <Link href={`/crm/customers/${row.id}`} className="customer-card-main">
                <span className="customer-card-title">
                  <strong>{row.name}</strong>
                  {row.priority ? <span className="customer-priority" style={{ color: row.priorityColor, borderColor: row.priorityColor }}>{row.priority}</span> : null}
                </span>
                <small>{[row.type, row.place].filter(Boolean).join(" · ") || "—"}</small>
                <span className="customer-card-meta">
                  <Badge variant={row.statusTone}>{row.status}</Badge>
                  {row.next ? <span className={cn("tabular-nums", row.overdue && "font-medium text-error-600 dark:text-error-500")}>{row.next}</span> : null}
                </span>
              </Link>
              <div className="customer-card-actions">
                {row.tel ? (
                  <a href={`tel:${row.tel}`} className="customer-call" aria-label={`${row.name} — დარეკვა ${row.phone}`}>
                    <Phone size={18} />
                  </a>
                ) : null}
                {row.mapped ? (
                  <button type="button" className="customer-card-icon" aria-label={`${row.name} — რუკაზე ჩვენება`} onClick={() => locate(row.id)}>
                    <MapPin size={18} />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <div className="customer-list-foot">{pager}</div>
      </Card>

      <Card className="customer-map p-3">
        <div ref={host} />
        <div className="mt-2.5 flex items-center justify-between gap-3 px-1">
          <p className="text-sm tabular-nums text-gray-500 dark:text-gray-400">რუკაზე {points.length} / {found}</p>
          {selected ? (
            <Link className="text-sm font-medium text-brand-500 hover:text-brand-600" href={`/crm/customers/${selected}`}>
              გახსნა
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
