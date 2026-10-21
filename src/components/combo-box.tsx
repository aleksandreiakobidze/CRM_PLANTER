"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string };

function initialValue(options: ComboOption[], defaultValue: string) {
  if (options.some((option) => option.value === defaultValue)) return defaultValue;
  if (defaultValue) return defaultValue;
  return options[0]?.value ?? "";
}

function SelectArrow({ open }: { open: boolean }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 transition-transform dark:text-gray-500",
        open && "rotate-180",
      )}
      aria-hidden
    >
      <ChevronDown size={18} />
    </span>
  );
}

function OptionList({
  id,
  visible,
  active,
  isSelected,
  showCheck = false,
  onActive,
  onChoose,
}: {
  id: string;
  visible: ComboOption[];
  active: number;
  isSelected: (value: string) => boolean;
  showCheck?: boolean;
  onActive: (index: number) => void;
  onChoose: (option: ComboOption) => void;
}) {
  return (
    <ul
      className="absolute inset-x-0 z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-800 dark:bg-gray-dark"
      id={id}
      role="listbox"
    >
      {visible.length === 0 ? (
        <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">ვერ მოიძებნა</li>
      ) : visible.map((option, index) => (
        <li key={`${option.value}-${option.label}`} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={isSelected(option.value)}
            className={cn(
              "flex min-h-8 w-full items-center justify-start gap-2 rounded-md bg-transparent px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.03]",
              index === active && "bg-gray-100 text-brand-500 dark:bg-white/[0.03] dark:text-brand-400",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onActive(index)}
            onClick={() => onChoose(option)}
          >
            {showCheck && isSelected(option.value) ? <span aria-hidden="true">✓</span> : null}
            {option.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ComboBox({
  name,
  options,
  defaultValue = "",
  value: controlled,
  onValueChange,
  required = false,
  placeholder = "ძებნა",
  label,
  allowCreate = false,
}: {
  name?: string;
  options: ComboOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  label?: string;
  allowCreate?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [uncontrolled, setUncontrolled] = useState(() => initialValue(options, defaultValue));
  const value = controlled ?? uncontrolled;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.value === value) ?? (value ? { value, label: value } : undefined);
  const visible = useMemo(() => {
    const needle = query.trim();
    const lowered = needle.toLocaleLowerCase("ka");
    const filtered = lowered
      ? options.filter((option) => option.label.toLocaleLowerCase("ka").includes(lowered))
      : options;
    if (
      allowCreate
      && needle
      && !options.some((option) => option.value.toLocaleLowerCase("ka") === lowered || option.label.toLocaleLowerCase("ka") === lowered)
    ) {
      return [...filtered, { value: needle, label: `დამატება · ${needle}` }];
    }
    return filtered;
  }, [allowCreate, options, query]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(option: ComboOption) {
    if (controlled === undefined) setUncontrolled(option.value);
    onValueChange?.(option.value);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = visible[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={label}
        className="pr-10"
        placeholder={selected?.label || placeholder}
        value={open ? query : selected?.label ?? ""}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(Math.max(visible.findIndex((option) => option.value === value), 0));
        }}
        onKeyDown={onKeyDown}
      />
      <SelectArrow open={open} />
      {open ? (
        <OptionList
          id={listId}
          visible={visible}
          active={active}
          isSelected={(item) => item === value}
          onActive={setActive}
          onChoose={choose}
        />
      ) : null}
    </div>
  );
}

export function MultiSelect({
  name,
  options,
  defaultValue = [],
  min = 0,
  placeholder = "არჩევა",
  label,
}: {
  name: string;
  options: ComboOption[];
  defaultValue?: string[];
  min?: number;
  placeholder?: string;
  label?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const allowed = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const [selected, setSelected] = useState(() => defaultValue.filter((value) => allowed.has(value)));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const chosen = options.filter((option) => selected.includes(option.value));
  const summary = chosen.map((option) => option.label).join(", ");
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ka");
    if (!needle) return options;
    return options.filter((option) => option.label.toLocaleLowerCase("ka").includes(needle));
  }, [options, query]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function toggle(option: ComboOption) {
    setSelected((current) => {
      if (current.includes(option.value)) {
        if (current.length <= min) return current;
        return current.filter((item) => item !== option.value);
      }
      return [...current, option.value];
    });
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = visible[active];
      if (option) toggle(option);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      {selected.map((value) => <input key={value} type="hidden" name={name} value={value} />)}
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-multiselectable="true"
        aria-label={label}
        className="pr-10"
        placeholder={summary || placeholder}
        value={open ? query : summary}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(Math.max(visible.findIndex((option) => selected.includes(option.value)), 0));
        }}
        onKeyDown={onKeyDown}
      />
      <SelectArrow open={open} />
      {open ? (
        <OptionList
          id={listId}
          visible={visible}
          active={active}
          isSelected={(item) => selected.includes(item)}
          showCheck
          onActive={setActive}
          onChoose={toggle}
        />
      ) : null}
    </div>
  );
}
