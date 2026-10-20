"use client";

import { useMemo, useState } from "react";
import { D } from "@/server/money";

export type DocumentLineMode = "sale" | "rental" | "stock";

export type CatalogItem = {
  value: string;
  label: string;
  price?: string;
};

type Row = {
  key: string;
  itemId: string;
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
  initial?: { itemId: string; quantity: string; unitPrice: string; discountAmount: string }[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.length ? initial.map((row) => ({ ...row, key: crypto.randomUUID() })) : [],
  );
  const [picking, setPicking] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const payload = useMemo(
    () => JSON.stringify(rows.map(({ itemId, quantity, unitPrice, discountAmount }) => ({ itemId, quantity, unitPrice, discountAmount }))),
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
  const itemHeader = mode === "rental" ? "მცენარე" : "აითემი";
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
        { key: crypto.randomUUID(), itemId: item.value, quantity: "1", unitPrice: price, discountAmount: "0" },
      ]);
    } else if (picking) {
      setRows((current) => current.map((row) => (row.key === picking ? { ...row, itemId: item.value, unitPrice: price || row.unitPrice } : row)));
    }
    setPicking(null);
    setQuery("");
  }

  return (
    <div className="lines">
      <input type="hidden" name={name} value={payload} />
      {rows.length === 0 ? <p className="muted">{mode === "rental" ? "მცენარე ჯერ არ არის არჩეული." : "აითემი ჯერ არ არის არჩეული."}</p> : (
        <table>
          <thead>
            <tr>
              <th>{itemHeader}</th>
              {mode === "rental" ? null : <th>რაოდენობა</th>}
              {mode === "stock" ? null : <th>{mode === "rental" ? "ფასი" : "ერთეულის ფასი"}</th>}
              {mode === "sale" ? <th>ფასდაკლება</th> : null}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = options.find((option) => option.value === row.itemId);
              return (
                <tr key={row.key}>
                  <td>
                    <div className="line-item">
                      <strong>{item?.label ?? "აითემი კატალოგში აღარ არის"}</strong>
                      <button type="button" className="secondary" onClick={() => { setPicking(row.key); setQuery(""); }}>
                        შეცვლა
                      </button>
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
                        aria-label={mode === "rental" ? "ფასი" : "ერთეულის ფასი"}
                        value={row.unitPrice}
                        onChange={(event) => patch(row.key, { unitPrice: event.target.value })}
                        required={mode === "rental"}
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
        {mode === "stock" ? null : <p className="doc-total">ჯამი: {total.toFixed(2)} ₾</p>}
      </div>
      {picking ? (
        <div className="item-picker">
          <label>
            ძებნა
            <input aria-label="აითემის ძებნა" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="სახელი ან SKU" />
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
