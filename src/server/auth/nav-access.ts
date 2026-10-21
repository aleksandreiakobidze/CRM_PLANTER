import type { Actor, PermissionCode } from "@/server/auth/permissions";

export const NAV_HREFS = [
  "/",
  "/work",
  "/calendar",
  "/chat",
  "/crm/customers",
  "/sales/quotes",
  "/sales/orders",
  "/finance/invoices",
  "/products",
  "/inventory",
  "/greenhouse",
  "/purchases",
  "/rental",
  "/projects",
  "/delivery",
  "/maintenance",
  "/excursions",
  "/events",
  "/marketing",
  "/reports",
  "/import",
  "/settings",
] as const;

const RULES: { prefix: string; anyOf: PermissionCode[] | "any" }[] = [
  { prefix: "/crm/customers", anyOf: ["crm.read"] },
  { prefix: "/sales", anyOf: ["sales.read"] },
  { prefix: "/finance", anyOf: ["finance.read"] },
  { prefix: "/products", anyOf: ["catalog.read"] },
  { prefix: "/inventory", anyOf: ["stock.read"] },
  { prefix: "/greenhouse", anyOf: ["stock.read"] },
  { prefix: "/purchases", anyOf: ["purchase.write"] },
  { prefix: "/rental", anyOf: ["rental.read"] },
  { prefix: "/projects", anyOf: ["sales.read"] },
  { prefix: "/delivery", anyOf: ["delivery.read"] },
  { prefix: "/maintenance", anyOf: ["maintenance.read"] },
  { prefix: "/excursions", anyOf: ["excursion.read", "excursion.write"] },
  { prefix: "/events", anyOf: ["excursion.read", "excursion.write"] },
  { prefix: "/marketing", anyOf: ["marketing.read"] },
  { prefix: "/reports", anyOf: ["reports.read"] },
  { prefix: "/import", anyOf: ["import.run"] },
  { prefix: "/settings", anyOf: "any" },
  { prefix: "/work", anyOf: "any" },
  { prefix: "/calendar", anyOf: "any" },
  { prefix: "/chat", anyOf: "any" },
  { prefix: "/search", anyOf: "any" },
];

function ruleFor(path: string) {
  const normalized = path.split("?")[0] || "/";
  if (normalized === "/") return { prefix: "/", anyOf: "any" as const };
  return RULES.filter((rule) => normalized === rule.prefix || normalized.startsWith(`${rule.prefix}/`)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
}

export function canAccessPath(actor: Actor, path: string): boolean {
  const rule = ruleFor(path);
  if (!rule || rule.anyOf === "any") return true;
  return rule.anyOf.some((code) => actor.permissions.has(code));
}

export function hrefsForActor(actor: Actor): string[] {
  return NAV_HREFS.filter((href) => canAccessPath(actor, href));
}
