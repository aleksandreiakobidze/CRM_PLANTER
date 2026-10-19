"use client";

import { isValidElement, useEffect, useState, type ReactNode } from "react";

export type RecordColumn = { key: string; header: string };
export type RecordRow = { id: string; cells: Record<string, ReactNode>; text?: string };

function cellText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(cellText).join(" ");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return cellText(props.children);
  }
  return "";
}

export function RecordList({
  storageKey,
  columns,
  rows,
  empty,
}: {
  storageKey: string;
  columns: RecordColumn[];
  rows: RecordRow[];
  empty: string;
}) {
  const [view, setView] = useState<"table" | "cards">("table");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(`planter-view:${storageKey}`);
    if (saved === "table" || saved === "cards") setView(saved);
  }, [storageKey]);

  function choose(next: "table" | "cards") {
    setView(next);
    window.localStorage.setItem(`planter-view:${storageKey}`, next);
  }

  const needle = query.trim().toLocaleLowerCase("ka");
  const shown = needle
    ? rows.filter((row) => {
        const hay = (row.text ?? columns.map((column) => cellText(row.cells[column.key])).join(" ")).toLocaleLowerCase("ka");
        return hay.includes(needle);
      })
    : rows;

  return (
    <div className="record-list">
      <div className="list-tools">
        {rows.length > 0 ? (
          <label className="filter-label">ფილტრი
            <input
              type="search"
              value={query}
              placeholder="ჩაწერე სიტყვა"
              aria-label="სიის ფილტრი"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : <span />}
        <div className="view-switch" role="group" aria-label="ხედი">
          <button type="button" className={view === "table" ? undefined : "secondary"} onClick={() => choose("table")}>ცხრილი</button>
          <button type="button" className={view === "cards" ? undefined : "secondary"} onClick={() => choose("cards")}>ბარათები</button>
        </div>
      </div>
      {rows.length > 0 ? <p className="muted list-count">{needle ? `${shown.length} / ${rows.length}` : `${rows.length} ჩანაწერი`}</p> : null}
      {shown.length === 0 ? <p className="card">{needle ? "ამ ფილტრს არაფერი ემთხვევა." : empty}</p> : view === "table" ? (
        <div className="record-scroll">
          <table className="record-table">
            <thead>
              <tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => <td key={column.key}>{row.cells[column.key] ?? "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="record-cards">
          {shown.map((row) => (
            <article key={row.id} className="record-card">
              {columns.map((column) => (
                <p key={column.key}>
                  <span className="muted">{column.header}</span>
                  <span>{row.cells[column.key] ?? "—"}</span>
                </p>
              ))}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
