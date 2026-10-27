"use client";

import { useMemo, useState } from "react";
import { D } from "@/server/money";
import { LINE_KIND_LABEL, SERVICE_KINDS, type LineKind } from "@/server/features/sales/line-kinds";

export type DocumentLineMode = "sale" | "rental" | "stock" | "purchase";

export type CatalogItem = {
  value: string;
  label: string;
  price?: string;
};

type Row = {
  key: string;
  kind: LineKind;
  itemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
};

function money(value: string | undefined) {
  if (!value) return "";
  const amount = D(value);
  return amount.isFinite() ? amount.toFixed(2) : "";
}

export function DocumentLines({
  name = "lines",
  mode,
  options,
  initial,
}: {
  name?: string;
  mode: DocumentLineMode;
  options: CatalogItem[];
  initial?: { kind?: LineKind; itemId: string; description?: string; quantity: string; unitPrice: string; discountAmount: string }[];
}) {
  const allowServices = mode === "sale";
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.length
      ? initial.map((row) => ({
          kind: row.kind ?? "item",
          itemId: row.itemId,
          description: row.description ?? "",
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          discountAmount: row.discountAmount,
          key: crypto.randomUUID(),
        }))
      : [],
  );
  const [picking, setPicking] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const payload = useMemo(
    () =>
      JSON.stringify(
        rows.map(({ kind, itemId, description, quantity, unitPrice, discountAmount }) => ({
          kind,
          itemId,
          description: kind === "item" ? "" : description,
          quantity,
          unitPrice,
          discountAmount,
        })),
      ),
    [rows],
  );
  const total = rows.reduce((sum, row) => {
    const quantity = D(row.quantity || "0");
    const price = D(row.unitPrice || "0");
    const discount = D(row.discountAmount || "0");
    if (mode === "stock") return sum;
    if (mode === "rental") return sum.plus(price);
    return sum.plus(quantity.mul(price).minus(discount));
  }, D(0));
  const addLabel = mode === "rental" ? "მცენარის დამატება" : "აითემის დამატება";
  const itemHeader = mode === "rental" ? "მცენარე" : "დასახელება";
  const priceHeader = mode === "rental" ? "ფასი" : mode === "purchase" ? "ერთეულის ღირებულება" : "ერთეულის ფასი";
  const emptyText = mode === "rental" ? "მცენარე ჯერ არ არის არჩეული." : "ხაზი ჯერ არ არის არჩეული.";
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ka");
    if (!needle) return options;
    return options.filter((item) => item.label.toLocaleLowerCase("ka").includes(needle));
  }, [options, query]);

  function patch(key: string, next: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));
  }

  function choose(item: CatalogItem) {
    const price = money(item.price);
    if (picking === "new") {
      setRows((current) => [
        ...current,
        { key: crypto.randomUUID(), kind: "item", itemId: item.value, description: item.label, quantity: "1", unitPrice: price, discountAmount: "0" },
      ]);
    } else if (picking) {
      setRows((current) =>
        current.map((row) =>
          row.key === picking ? { ...row, kind: "item", itemId: item.value, description: item.label, unitPrice: price || row.unitPrice } : row,
        ),
      );
    }
    setPicking(null);
    setQuery("");
  }

  function addService(kind: LineKind) {
    setRows((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        kind,
        itemId: "",
        description: LINE_KIND_LABEL[kind],
        quantity: "1",
        unitPrice: "",
        discountAmount: "0",
      },
    ]);
    setPicking(null);
    setQuery("");
  }

  return (
    <div className="lines">
      <input type="hidden" name={name} value={payload} />
      {rows.length === 0 ? <p className="muted">{emptyText}</p> : (
        <table>
          <thead>
            <tr>
              <th>{itemHeader}</th>
              {mode === "rental" ? null : <th>რაოდენობა</th>}
              {mode === "stock" ? null : <th>{priceHeader}</th>}
              {mode === "sale" ? <th>ფასდაკლება</th> : null}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = options.find((option) => option.value === row.itemId);
              const service = row.kind !== "item";
              return (
                <tr key={row.key}>
                  <td>
                    <div className="line-item">
                      <div className="line-item-head">
                        <span className="line-kind">{LINE_KIND_LABEL[row.kind]}</span>
                        {service ? null : (
                          <button type="button" className="secondary" onClick={() => { setPicking(row.key); setQuery(""); }}>
                            შეცვლა
                          </button>
                        )}
                      </div>
                      {service ? (
                        <input
                          aria-label={LINE_KIND_LABEL[row.kind]}
                          value={row.description}
                          onChange={(event) => patch(row.key, { description: event.target.value })}
                          required
                        />
                      ) : (
                        <strong>{item?.label ?? row.description ?? "აითემი კატალოგში აღარ არის"}</strong>
                      )}
                    </div>
                  </td>
                  {mode === "rental" ? null : (
                    <td>
                      <input aria-label="რაოდენობა" value={row.quantity} onChange={(event) => patch(row.key, { quantity: event.target.value })} required />
                    </td>
                  )}
                  {mode === "stock" ? null : (
                    <td>
                      <input
                        aria-label={priceHeader}
                        value={row.unitPrice}
                        onChange={(event) => patch(row.key, { unitPrice: event.target.value })}
                        required={mode === "rental" || mode === "purchase" || service}
                      />
                    </td>
                  )}
                  {mode === "sale" ? (
                    <td>
                      <input aria-label="ფასდაკლება" value={row.discountAmount} onChange={(event) => patch(row.key, { discountAmount: event.target.value })} />
                    </td>
                  ) : null}
                  <td>
                    <button type="button" className="secondary" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                      წაშლა
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="line-actions">
        <div className="line-adders">
          <button
            type="button"
            className="secondary"
            aria-expanded={picking === "new"}
            onClick={() => {
              setPicking((current) => (current === "new" ? null : "new"));
              setQuery("");
            }}
          >
            {addLabel}
          </button>
          {allowServices
            ? SERVICE_KINDS.map((kind) => (
                <button key={kind} type="button" className="secondary" onClick={() => addService(kind)}>
                  {LINE_KIND_LABEL[kind]}
                </button>
              ))
            : null}
        </div>
        {mode === "stock" ? null : <p className="doc-total">ჯამი: {total.toFixed(2)} ₾</p>}
      </div>
      {picking ? (
        <div className="item-picker">
          <label>
            ძებნა
            <input aria-label="ძებნა" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="შიდა კოდი, SKU ან სახელი" />
          </label>
          <ul>
            {visible.length === 0 ? <li className="combo-empty">ვერ მოიძებნა</li> : visible.map((item) => (
              <li key={item.value}>
                <button type="button" className="item-option" role="option" onClick={() => choose(item)}>
                  <span>{item.label}</span>
                  {item.price ? <span>{money(item.price)} ₾</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
