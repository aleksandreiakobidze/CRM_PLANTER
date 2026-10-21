"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart,
  Bus,
  CalendarDays,
  ClipboardList,
  FileText,
  Home,
  Leaf,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  Package,
  PanelLeft,
  PartyPopper,
  Receipt,
  Repeat,
  Settings,
  ShoppingCart,
  Trees,
  Truck,
  Upload,
  Users,
  Warehouse,
  Wrench,
  X,
} from "@/components/icons";
import { logoutAction } from "@/server/actions/auth-actions";
import { MessengerDock } from "@/components/messenger";
import { ThemeToggle } from "@/components/theme-toggle";
import { CHAT_COPY } from "@/server/features/chat/chat-copy";

const ICONS: Record<string, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  "/": Home,
  "/work": ClipboardList,
  "/calendar": CalendarDays,
  "/crm/customers": Users,
  "/sales/quotes": FileText,
  "/sales/orders": ClipboardList,
  "/finance/invoices": Receipt,
  "/products": Package,
  "/inventory": Warehouse,
  "/rental": Repeat,
  "/greenhouse": Leaf,
  "/purchases": ShoppingCart,
  "/projects": Trees,
  "/delivery": Truck,
  "/reports": BarChart,
  "/marketing": Megaphone,
  "/events": PartyPopper,
  "/maintenance": Wrench,
  "/excursions": Bus,
  "/import": Upload,
  "/settings": Settings,
  "/chat": MessageCircle,
};

const GROUPS: { title: string; links: [string, string][] }[] = [
  {
    title: "სამუშაო",
    links: [
      ["/", "მთავარი"],
      ["/work", "ჩემი სამუშაო"],
      ["/calendar", "კალენდარი"],
      ["/chat", CHAT_COPY.chat],
    ],
  },
  {
    title: "გაყიდვა",
    links: [
      ["/crm/customers", "კლიენტები"],
      ["/sales/quotes", "შეთავაზებები"],
      ["/sales/orders", "შეკვეთები"],
      ["/finance/invoices", "ინვოისები"],
    ],
  },
  {
    title: "საწყობი",
    links: [
      ["/products", "პროდუქტები"],
      ["/inventory", "მარაგი"],
      ["/greenhouse", "სათბური"],
      ["/purchases", "შესყიდვები"],
      ["/rental", "გაქირავება"],
    ],
  },
  {
    title: "სერვისი",
    links: [
      ["/projects", "გამწვანება"],
      ["/delivery", "მიწოდება"],
      ["/maintenance", "მოვლა"],
      ["/excursions", "ექსკურსიები"],
      ["/events", "ღონისძიებები"],
      ["/marketing", "მარკეტინგი"],
      ["/reports", "რეპორტები"],
      ["/import", "იმპორტი"],
      ["/settings", "პარამეტრები"],
    ],
  },
];

const GO: Record<string, string> = {
  h: "/",
  w: "/work",
  c: "/calendar",
  k: "/crm/customers",
};

function active(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

function NavLink({ href, label, path, onNavigate }: { href: string; label: string; path: string; onNavigate?: () => void }) {
  const Icon = ICONS[href];
  return (
    <Link href={href} aria-label={label} aria-current={active(path, href) ? "page" : undefined} title={label} onClick={onNavigate}>
      {Icon ? <Icon className="nav-ico" aria-hidden /> : null}
      <span className="nav-label">{label}</span>
    </Link>
  );
}

export function AppShell({ children, allowedHrefs }: { children: React.ReactNode; allowedHrefs: string[] }) {
  const path = usePathname();
  const router = useRouter();
  const [compact, setCompact] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const allowed = new Set(allowedHrefs);
  const groups = GROUPS.map((group) => ({
    ...group,
    links: group.links.filter(([href]) => allowed.has(href)),
  })).filter((group) => group.links.length > 0);

  useEffect(() => {
    if (window.localStorage.getItem("planter-nav-compact") === "1") setCompact(true);
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [path]);

  useEffect(() => {
    let chord = false;
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      const typing = target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
      if (event.key === "Escape") {
        chord = false;
        setNavOpen(false);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".search input")?.focus();
        chord = false;
        return;
      }
      if (event.key === "g") {
        chord = true;
        return;
      }
      if (chord && GO[event.key] && allowed.has(GO[event.key])) {
        event.preventDefault();
        router.push(GO[event.key]);
      }
      chord = false;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, allowedHrefs]);

  function toggleNav() {
    setCompact((current) => {
      window.localStorage.setItem("planter-nav-compact", current ? "0" : "1");
      return !current;
    });
  }

  const shellClass = [compact ? "shell compact" : "shell", navOpen ? "nav-open" : ""].filter(Boolean).join(" ");

  return (
    <div className={shellClass}>
      <a className="skip" href="#main">მთავარ შიგთავსზე</a>
      <button type="button" className="nav-scrim" aria-label="მენიუს დახურვა" onClick={() => setNavOpen(false)} />
      <aside className="side" id="app-nav">
        <Link href="/" className="brand-link" aria-label="Planter, მთავარი" onClick={() => setNavOpen(false)}>
          <img className="logo-full" src="/brand/planter-logo.png" alt="" />
          <img className="logo-mark" src="/brand/planter-mark.png" alt="" />
        </Link>
        <button type="button" className="secondary nav-collapse" aria-pressed={compact} aria-label={compact ? "მენიუს გაშლა" : "მენიუს შეკეცვა"} onClick={toggleNav}>
          <PanelLeft className="nav-ico" aria-hidden />
          <span className="nav-label">{compact ? "გაშლა" : "მენიუს შეკეცვა"}</span>
        </button>
        <nav aria-label="მთავარი ნავიგაცია">
          {compact ? groups.flatMap((group) => group.links).map(([href, label]) => (
            <NavLink key={href} href={href} label={label} path={path} onNavigate={() => setNavOpen(false)} />
          )) : groups.map((group) => (
            <details key={group.title} className="nav-group" open>
              <summary>{group.title}</summary>
              {group.links.map(([href, label]) => (
                <NavLink key={href} href={href} label={label} path={path} onNavigate={() => setNavOpen(false)} />
              ))}
            </details>
          ))}
        </nav>
        <form action={logoutAction}>
          <button className="secondary" type="submit" title="გასვლა" aria-label="გასვლა">
            <LogOut className="nav-ico" aria-hidden />
            <span className="nav-label">გასვლა</span>
          </button>
        </form>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="secondary menu-toggle"
            aria-expanded={navOpen}
            aria-controls="app-nav"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <X className="nav-ico" aria-hidden /> : <Menu className="nav-ico" aria-hidden />}
            მენიუ
          </button>
          <form className="search" action="/search" role="search">
            <input name="q" type="search" placeholder="კლიენტი, ს/კ, ტელეფონი, SKU ან ინვოისი" aria-label="ძებნა" enterKeyHint="search" />
            <button type="submit">ძებნა</button>
          </form>
          <div className="topbar-tools">
            <MessengerDock />
            <ThemeToggle />
          </div>
        </header>
        <main className="main" id="main">{children}</main>
      </div>
    </div>
  );
}
