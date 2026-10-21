import type { ReactNode, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function frame({ size = 18, className, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

function glyph(props: IconProps, path: string) {
  return frame({ ...props, children: <path d={path} /> });
}

export function Home(props: IconProps) {
  return glyph(props, "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z");
}
export function ClipboardList(props: IconProps) {
  return glyph(props, "M8 5h8M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1zM7 6h10v14H7zM9 11h6M9 15h4");
}
export function CalendarDays(props: IconProps) {
  return glyph(props, "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01");
}
export function Users(props: IconProps) {
  return glyph(props, "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75");
}
export function FileText(props: IconProps) {
  return glyph(props, "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6");
}
export function Receipt(props: IconProps) {
  return glyph(props, "M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2zM8 8h8M8 12h8");
}
export function Package(props: IconProps) {
  return glyph(props, "M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5M21 8v8l-9 5M12 13v8");
}
export function Warehouse(props: IconProps) {
  return glyph(props, "M22 21V8l-10-5L2 8v13M6 21v-8h12v8M6 13h12");
}
export function Repeat(props: IconProps) {
  return glyph(props, "M17 2l4 4-4 4M21 6H9a6 6 0 0 0-6 6M7 22l-4-4 4-4M3 18h12a6 6 0 0 0 6-6");
}
export function Wrench(props: IconProps) {
  return glyph(props, "M14.7 6.3a5 5 0 0 0-6.6 6.6L3 18l3 3 5.1-5.1a5 5 0 0 0 6.6-6.6L15 12z");
}
export function Bus(props: IconProps) {
  return glyph(props, "M6 3h12a2 2 0 0 1 2 2v12H4V5a2 2 0 0 1 2-2zM4 17h16v2a1 1 0 0 1-1 1h-1M6 20H5a1 1 0 0 1-1-1v-2M8 20h8M6 9h12M6 13h2M16 13h2");
}
export function Upload(props: IconProps) {
  return glyph(props, "M12 16V4M7 9l5-5 5 5M4 20h16");
}
export function Settings(props: IconProps) {
  return glyph(props, "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.7.9 1.2 1.6 1.3H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z");
}
export function LogOut(props: IconProps) {
  return glyph(props, "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9");
}
export function PanelLeft(props: IconProps) {
  return glyph(props, "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16");
}
export function Menu(props: IconProps) {
  return glyph(props, "M4 6h16M4 12h16M4 18h16");
}
export function X(props: IconProps) {
  return glyph(props, "M18 6 6 18M6 6l12 12");
}
export function Pencil(props: IconProps) {
  return glyph(props, "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z");
}
export function ChevronDown(props: IconProps) {
  return glyph(props, "m6 9 6 6 6-6");
}
export function ChevronRight(props: IconProps) {
  return glyph(props, "m9 18 6-6-6-6");
}
export function UserPlus(props: IconProps) {
  return glyph(props, "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M16 11h6");
}
export function FilePlus(props: IconProps) {
  return glyph(props, "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 11v6M9 14h6");
}
export function Leaf(props: IconProps) {
  return glyph(props, "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10zM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12");
}
export function ShoppingCart(props: IconProps) {
  return glyph(props, "M6 6h15l-1.5 9h-12zM6 6 5 3H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z");
}
export function Truck(props: IconProps) {
  return glyph(props, "M14 18V6H3v12h2M14 8h4l3 4v6h-2M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z");
}
export function BarChart(props: IconProps) {
  return glyph(props, "M4 20h16M7 16V10M12 16V4M17 16v-6");
}
export function Megaphone(props: IconProps) {
  return glyph(props, "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 8.5a5 5 0 0 1 0 7");
}
export function Trees(props: IconProps) {
  return glyph(props, "M10 21v-4M7 21h6M10 17 5 10h4L6 4h8l-3 6h4zM17 21v-3M15 21h4M17 18l-3-5h3l-2-5h6l-2 5h3z");
}
export function Paperclip(props: IconProps) {
  return glyph(props, "m21.4 11.1-9.2 9.2a6 6 0 1 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7L9.4 17.4a2 2 0 1 1-2.8-2.8l8.5-8.5");
}
export function Plus(props: IconProps) {
  return glyph(props, "M12 5v14M5 12h14");
}
export function Clock(props: IconProps) {
  return glyph(props, "M12 8v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z");
}
export function Sun(props: IconProps) {
  return frame({
    ...props,
    children: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </>
    ),
  });
}
export function Moon(props: IconProps) {
  return glyph(props, "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z");
}
export function PartyPopper(props: IconProps) {
  return glyph(props, "M5.8 11.3 2 22l10.7-3.8M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.24.75a2.9 8.7 0 0 0-1.01 8.7L11 13.5");
}
export function MessageCircle(props: IconProps) {
  return glyph(props, "M7.9 20A9 9 0 1 0 4 16.1L2 22z");
}
export function Send(props: IconProps) {
  return glyph(props, "m22 2-7 20-4-9-9-4zM22 2 11 13");
}
