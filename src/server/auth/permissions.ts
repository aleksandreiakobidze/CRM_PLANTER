import { BusinessError } from "@/server/errors";

export const PERMISSIONS = [
  "crm.read",
  "crm.write",
  "catalog.read",
  "catalog.write",
  "stock.read",
  "stock.write",
  "stock.cost.read",
  "sales.read",
  "sales.write",
  "finance.read",
  "finance.write",
  "rental.read",
  "rental.write",
  "maintenance.read",
  "maintenance.write",
  "excursion.read",
  "excursion.write",
  "import.run",
  "admin.users",
  "reports.read",
  "task.read.all",
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

export const ROLE_PRESETS: Record<string, { nameKa: string; permissions: PermissionCode[] }> = {
  owner: { nameKa: "ადმინისტრატორი", permissions: [...PERMISSIONS] },
  sales_manager: {
    nameKa: "გაყიდვების მენეჯერი",
    permissions: ["crm.read", "crm.write", "catalog.read", "sales.read", "sales.write", "stock.read", "reports.read", "task.read.all"],
  },
  operations_manager: {
    nameKa: "ოპერაციების მენეჯერი",
    permissions: [
      "stock.read",
      "stock.write",
      "stock.cost.read",
      "rental.read",
      "rental.write",
      "maintenance.read",
      "maintenance.write",
      "excursion.read",
      "excursion.write",
      "catalog.read",
      "task.read.all",
    ],
  },
  warehouse: { nameKa: "სათბური / საწყობი", permissions: ["stock.read", "stock.write", "catalog.read"] },
  agronomist: { nameKa: "აგრონომი", permissions: ["maintenance.read", "maintenance.write", "catalog.read"] },
  excursion_coordinator: {
    nameKa: "ექსკურსიის კოორდინატორი",
    permissions: ["excursion.read", "excursion.write", "crm.read", "crm.write"],
  },
  driver: { nameKa: "მძღოლი", permissions: ["stock.read"] },
  finance: {
    nameKa: "ფინანსები",
    permissions: ["finance.read", "finance.write", "reports.read", "crm.read", "sales.read"],
  },
  marketing: { nameKa: "მარკეტინგი", permissions: ["crm.read", "crm.write", "reports.read"] },
};

export type Actor = {
  userId: string;
  organizationId: string;
  email: string;
  permissions: Set<string>;
};

export function requirePermission(actor: Actor, permission: PermissionCode): void {
  if (!actor.permissions.has(permission)) {
    throw new BusinessError("ამ მოქმედების უფლება არ გაქვთ", "forbidden");
  }
}

export function can(actor: Actor, permission: PermissionCode): boolean {
  return actor.permissions.has(permission);
}
