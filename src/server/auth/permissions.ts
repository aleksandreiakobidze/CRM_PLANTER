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
  "reports.sales.read",
  "task.read.all",
  "purchase.write",
  "delivery.read",
  "delivery.write",
  "marketing.read",
  "marketing.write",
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number];

const MANAGER_PERMISSIONS: PermissionCode[] = [
  "crm.read",
  "crm.write",
  "catalog.read",
  "sales.read",
  "sales.write",
  "stock.read",
  "stock.write",
  "rental.read",
  "rental.write",
  "maintenance.read",
  "maintenance.write",
  "excursion.read",
  "excursion.write",
  "reports.read",
  "task.read.all",
  "purchase.write",
  "delivery.read",
  "delivery.write",
];

export const ROLE_PRESETS: Record<string, { nameKa: string; permissions: PermissionCode[] }> = {
  owner: { nameKa: "ადმინისტრატორი", permissions: [...PERMISSIONS] },
  admin: { nameKa: "ადმინი", permissions: [...PERMISSIONS] },
  manager: { nameKa: "მენეჯერი", permissions: MANAGER_PERMISSIONS },
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
      "purchase.write",
      "delivery.read",
      "delivery.write",
    ],
  },
  warehouse: { nameKa: "სათბური / საწყობი", permissions: ["stock.read", "stock.write", "catalog.read", "purchase.write"] },
  agronomist: { nameKa: "აგრონომი", permissions: ["maintenance.read", "maintenance.write", "catalog.read"] },
  excursion_coordinator: {
    nameKa: "ექსკურსიის კოორდინატორი",
    permissions: ["excursion.read", "excursion.write", "crm.read", "crm.write"],
  },
  driver: { nameKa: "მძღოლი", permissions: ["stock.read", "delivery.read"] },
  finance: {
    nameKa: "ფინანსები",
    permissions: ["finance.read", "finance.write", "reports.read", "crm.read", "sales.read"],
  },
  marketing: {
    nameKa: "მარკეტინგი",
    permissions: ["marketing.read", "marketing.write", "crm.read", "crm.write", "reports.read", "excursion.write"],
  },
};

export type Actor = {
  userId: string;
  organizationId: string;
  email: string;
  username?: string | null;
  permissions: Set<string>;
};

export function isMasterAdmin(actor: Actor): boolean {
  return actor.username === "Admin";
}

export function requirePermission(actor: Actor, permission: PermissionCode): void {
  if (!actor.permissions.has(permission)) {
    throw new BusinessError("ამ მოქმედების უფლება არ გაქვთ", "forbidden");
  }
}

export function can(actor: Actor, permission: PermissionCode): boolean {
  return actor.permissions.has(permission);
}

export function canSeeSalesTotals(actor: Actor): boolean {
  return actor.permissions.has("reports.sales.read");
}
