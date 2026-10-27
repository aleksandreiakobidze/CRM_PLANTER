"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ComboBox, type ComboOption } from "@/components/combo-box";
import { ChevronDown, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STORE_KEY = "planter.customers.filters";
const PHONE_QUERY = "(max-width: 800px)";

export type FilterGroup = {
  title: string;
  fields: { name: string; label: string; options: ComboOption[] }[];
};

export function CustomerFilters({
  filters,
  keep,
  activeCount,
  groups,
}: {
  filters: Record<string, string>;
  keep: Record<string, string>;
  activeCount: number;
  groups: FilterGroup[];
}) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(media.matches);
    sync();
    if (!media.matches && window.localStorage.getItem(STORE_KEY) === "open") setOpen(true);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!phone || !open) return;
    document.body.classList.add("messenger-lock");
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("messenger-lock");
      document.removeEventListener("keydown", onKey);
    };
  }, [open, phone]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!phone) window.localStorage.setItem(STORE_KEY, next ? "open" : "closed");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    if (filters.status) params.set("status", filters.status);
    for (const [key, value] of Object.entries(keep)) params.set(key, value);
    const query = params.toString();
    if (phone) setOpen(false);
    router.push(query ? `/crm/customers?${query}` : "/crm/customers");
  }

  function clear() {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.status) params.set("status", filters.status);
    for (const [key, value] of Object.entries(keep)) params.set(key, value);
    const query = params.toString();
    if (phone) setOpen(false);
    router.push(query ? `/crm/customers?${query}` : "/crm/customers");
  }

  return (
    <form className="customer-filters" role="search" aria-label="კლიენტების ფილტრი" onSubmit={submit}>
      <div className="customer-filter-bar">
        <label className="customer-search">
          <Search size={18} aria-hidden />
          <Input
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="სახელი, ს/კ, ტელეფონი, მისამართი"
            aria-label="ძებნა"
            enterKeyHint="search"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          className={cn("customer-filter-toggle", (open || activeCount > 0) && "on")}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <SlidersHorizontal size={16} aria-hidden />
          <span>ფილტრები</span>
          {activeCount > 0 ? <span className="customer-filter-count">{activeCount}</span> : null}
          <ChevronDown size={16} className="customer-filter-chevron" aria-hidden />
        </Button>
        <Button type="submit" className="customer-filter-go">ძებნა</Button>
      </div>
      {phone && open ? <button type="button" className="customer-sheet-scrim" aria-label="დახურვა" onClick={() => setOpen(false)} /> : null}
      <div id={panelId} className={cn("customer-filter-panel", open && "open")} hidden={!open}>
        <div className="customer-sheet-head">
          <strong>ფილტრები</strong>
          <Button type="button" variant="ghost" size="icon" aria-label="დახურვა" onClick={() => setOpen(false)}>
            <X size={18} />
          </Button>
        </div>
        <div className="customer-filter-groups">
          {groups.map((group) => (
            <fieldset key={group.title} className="customer-filter-group">
              <legend>{group.title}</legend>
              <div className="customer-filter-fields">
                {group.fields.map((field) => (
                  <div key={field.name} className="min-w-0">
                    <span className="customer-filter-label">{field.label}</span>
                    <ComboBox name={field.name} label={field.label} options={field.options} defaultValue={filters[field.name] ?? ""} />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="customer-filter-actions">
          <Button type="button" variant="secondary" onClick={clear}>გასუფთავება</Button>
          <Button type="submit">ჩვენება</Button>
        </div>
      </div>
    </form>
  );
}
