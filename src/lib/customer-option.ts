import type { ComboOption } from "@/components/combo-box";

export type CustomerOptionSource = {
  id: string;
  name: string;
  identificationCode?: string | null;
  phone?: string | null;
};

export function customerOption(customer: CustomerOptionSource): ComboOption {
  const code = customer.identificationCode?.trim() || "";
  return {
    value: customer.id,
    label: code ? `${customer.name} · ${code}` : customer.name,
    search: [customer.name, code, customer.phone ?? ""].filter(Boolean).join(" "),
  };
}
