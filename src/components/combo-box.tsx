"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboOption = { value: string; label: string };

function initialValue(options: ComboOption[], defaultValue: string) {
  if (options.some((option) => option.value === defaultValue)) return defaultValue;
  return options[0]?.value ?? "";
}

export function ComboBox({
  name,
  options,
  defaultValue = "",
  required = false,
  placeholder = "ძებნა",
}: {
  name: string;
  options: ComboOption[];
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(() => initialValue(options, defaultValue));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.value === value);
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

  function choose(option: ComboOption) {
    setValue(option.value);
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
    <div className="combo" ref={rootRef}>
      <input type="hidden" name={name} value={value} required={required} />
      <input
        className="combo-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
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
      {open ? (
        <ul className="combo-list" id={listId} role="listbox">
          {visible.length === 0 ? <li className="combo-empty">ვერ მოიძებნა</li> : visible.map((option, index) => (
            <li key={`${option.value}-${option.label}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={index === active ? "active" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
