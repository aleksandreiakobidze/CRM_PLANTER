"use client";

import { useState } from "react";
import { BoundForm } from "@/components/bound-form";
import { ComboBox, type ComboOption } from "@/components/combo-box";
import { DocumentLines, type CatalogItem } from "@/components/document-lines";
import { PostingForm } from "@/components/posting-form";
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
  posting,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  mode: "sale" | "rental" | "stock" | "purchase";
  partyName?: string;
  partyLabel?: string;
  partyDefault?: string;
  parties?: ComboOption[];
  items: CatalogItem[];
  initialLines?: { kind?: LineKind; itemId: string; description?: string; quantity: string; unitPrice: string; discountAmount: string }[];
  extra?: React.ReactNode;
  posting?: { pickLabels: Record<string, string> };
}) {
  const [postingKey] = useState(() => crypto.randomUUID());
  const body = (
    <>
      <input type="hidden" name="postingKey" value={postingKey} />
      {partyName && parties ? (
        <label>
          {partyLabel}
          <ComboBox name={partyName} required options={parties} defaultValue={partyDefault} />
        </label>
      ) : null}
      {extra}
      <DocumentLines mode={mode} options={items} initial={initialLines} />
    </>
  );
  if (posting) {
    return (
      <PostingForm action={action} label={label} pickLabels={posting.pickLabels}>
        {body}
      </PostingForm>
    );
  }
  return (
    <BoundForm action={action} label={label}>
      {body}
    </BoundForm>
  );
}
