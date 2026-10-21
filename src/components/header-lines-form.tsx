"use client";

import { useState } from "react";
import { BoundForm } from "@/components/bound-form";
import { ComboBox, type ComboOption } from "@/components/combo-box";
import { DocumentLines, type CatalogItem } from "@/components/document-lines";
import type { ActionState } from "@/server/actions/state";
import type { LineKind } from "@/server/features/sales/line-kinds";

export function HeaderLinesForm({
  action,
  label,
  mode,
  partyName,
  partyLabel,
  partyDefault,
  parties,
  items,
  initialLines,
  extra,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  mode: "sale" | "rental" | "stock";
  partyName?: string;
  partyLabel?: string;
  partyDefault?: string;
  parties?: ComboOption[];
  items: CatalogItem[];
  initialLines?: { kind?: LineKind; itemId: string; description?: string; quantity: string; unitPrice: string; discountAmount: string }[];
  extra?: React.ReactNode;
}) {
  const [postingKey] = useState(() => crypto.randomUUID());
  return (
    <BoundForm action={action} label={label}>
      <input type="hidden" name="postingKey" value={postingKey} />
      {partyName && parties ? (
        <label>
          {partyLabel}
          <ComboBox name={partyName} required options={parties} defaultValue={partyDefault} />
        </label>
      ) : null}
      {extra}
      <DocumentLines mode={mode} options={items} initial={initialLines} />
    </BoundForm>
  );
}
