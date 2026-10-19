"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bus,
  CalendarDays,
  ClipboardList,
  FileText,
  Home,
  LogOut,
  Menu,
  Package,
  PanelLeft,
  Receipt,
  Repeat,
  Settings,
  Upload,
  Users,
  Warehouse,
  Wrench,
  X,
} from "@/components/icons";
import { logoutAction } from "@/server/actions/auth-actions";

const ICONS: Record<string, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  "/": Home,
  "/work": ClipboardList,
  "/calendar": CalendarDays,
  "/crm/customers": Users,
  "/sales/quotes": FileText,
  "/finance/invoices": Receipt,
  "/products": Package,
  "/inventory": Warehouse,
  "/rental": Repeat,
  "/maintenance": Wrench,
  "/excursions": Bus,
  "/import": Upload,
  "/settings": Settings,
};

const GROUPS: { title: string; links: [string, string][] }[] = [
  {
    title: "სამუშაო",
    links: [
      ["/", "მთავარი"],
      ["/work", "ჩემი სამუშაო"],
      ["/calendar", "კალენდარი"],
    ],
  },
  {
    title: "გაყიდვა",
    links: [
      ["/crm/customers", "კლიენტები"],
      ["/sales/quotes", "შეთავაზებები"],
      ["/finance/invoices", "ინვოისები"],
    ],
  },
  {
    title: "საწყობი",
    links: [
      ["/products", "პროდუქტები"],
      ["/inventory", "მარაგი"],
      ["/rental", "გაქირავება"],
    ],
  },
  {
    title: "სერვისი",
    links: [
      ["/maintenance", "მოვლა"],
      ["/excursions", "ექსკურსიები"],
      ["/import", "იმპორტი"],
      ["/settings", "პარამეტრები"],
    ],
  },
];

const LATER = ["სათბური · ეტაპი 3", "შესყიდვები · ეტაპი 3", "მიწოდება · ეტაპი 3", "მარკეტინგი · ეტაპი 4"];

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [compact, setCompact] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

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
      if (chord && GO[event.key]) {
        event.preventDefault();
        router.push(GO[event.key]);
      }
      chord = false;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

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
          {compact ? GROUPS.flatMap((group) => group.links).map(([href, label]) => (
            <NavLink key={href} href={href} label={label} path={path} onNavigate={() => setNavOpen(false)} />
          )) : GROUPS.map((group) => (
            <details key={group.title} className="nav-group" open>
              <summary>{group.title}</summary>
              {group.links.map(([href, label]) => (
                <NavLink key={href} href={href} label={label} path={path} onNavigate={() => setNavOpen(false)} />
              ))}
            </details>
          ))}
          {compact ? null : (
            <details className="nav-group">
              <summary>შემდეგი ეტაპები</summary>
              {LATER.map((label) => (
                <span key={label} className="muted-nav">{label}</span>
              ))}
            </details>
          )}
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
            <input name="q" type="search" placeholder="კლიენტი, ტელეფონი, SKU ან ინვოისი" aria-label="ძებნა" enterKeyHint="search" />
            <button type="submit">ძებნა</button>
          </form>
        </header>
        <main className="main" id="main">{children}</main>
      </div>
    </div>
  );
}
