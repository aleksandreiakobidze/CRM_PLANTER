import Link from "next/link";

export function DocTabs({
  label,
  tabs,
  current,
}: {
  label: string;
  tabs: { id: string; label: string; href: string }[];
  current: string;
}) {
  return (
    <nav className="segment" aria-label={label}>
      {tabs.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.id === current ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
