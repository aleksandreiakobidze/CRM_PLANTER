# Design guide

Warm paper background, forest ink, and a teal accent. Corners are large. Cards are nearly white and slightly transparent. Numbers use tabular figures.

## Font

Noto Sans Georgian, weights 400, 500, 600, 700. `lang="ka"`, antialiased.

```ts
import { Noto_Sans_Georgian } from "next/font/google";

const font = Noto_Sans_Georgian({
  subsets: ["georgian", "latin"],
  weight: ["400", "500", "600", "700"],
});
```

## Colors

| Role | Hex | Use |
|---|---|---|
| Paper | `#f4efe6` | Page background, header |
| Text | `#1c1917` | `stone-900` |
| Ink | `#1a2e24` | Logo, active tab, primary button |
| Ink hover | `#244033` | Primary button hover |
| On ink | `#fffbeb` | `amber-50` text on ink |
| Accent | `#0f766e` | `teal-700` |
| Accent dark | `#115e59` | `teal-800` secondary button and accent card |
| Link | `#134e4a` | `teal-900` |
| Neutral | stone 50–900 | Body text, borders, inputs |
| Success | emerald 50 / 100 / 900 | Green row and badge |
| Error | rose 50 / 100 / 900 | Red row and banner |
| Warning | amber 50 / 100 / 950 | Pending and warning |

Stone scale:

| Token | Hex |
|---|---|
| stone-50 | `#fafaf9` |
| stone-100 | `#f5f5f4` |
| stone-200 | `#e7e5e4` |
| stone-300 | `#d6d3d1` |
| stone-400 | `#a8a29e` |
| stone-500 | `#78716c` |
| stone-600 | `#57534e` |
| stone-700 | `#44403c` |
| stone-800 | `#292524` |
| stone-900 | `#1c1917` |

Page background has two faint washes: teal on the left `rgba(15, 118, 110, 0.08)` and amber on the right `rgba(180, 83, 9, 0.06)`. Selection is `rgba(15, 118, 110, 0.18)`.

## Type

| Element | Size | Weight | Style |
|---|---|---|---|
| Overline | 11–12px | 500 | uppercase, tracking 0.16–0.18em, `teal-800/70` |
| Header title | 18px / 20px | 600 | `stone-900` |
| Section title | 24px | 600 | `stone-900` |
| Body | 14px | 400 | `stone-500`–`700` |
| Table header | 11–12px | 500 | uppercase, `stone-500` |
| Amount | 16–20px | 600 | `tabular-nums` |
| VAT | 12px | 400 | `tabular-nums text-teal-800` |

## Layout

- Container: `max-w-6xl mx-auto px-4`
- Main: `py-8`
- Card padding: `p-5 sm:p-6`
- Table cell: `px-5 py-3`, nested tables `px-4 py-2.5`
- Header: sticky, `py-4`, `backdrop-blur-xl`, `border-b border-stone-200/80`, background `#f4efe6` at 80%

Radii:

- Card: 24px (`rounded-3xl`)
- Button and tab: full pill (`rounded-full`)
- Input and summary card: 16px (`rounded-2xl`)

Shadow: `0 18px 50px -28px rgba(28, 25, 23, 0.35)`. Lists use the stronger `0.45` alpha.

## Components

**Card**

```
rounded-3xl border border-stone-200/80 bg-white/80 p-5 sm:p-6
shadow-[0_18px_50px_-28px_rgba(28,25,23,0.35)]
```

Lists and tables use `bg-white/90` and the stronger shadow.

**Primary button**

```
rounded-full bg-[#1a2e24] px-4 py-2 text-sm font-medium text-amber-50
hover:bg-[#244033] disabled:opacity-60
```

**Secondary button**

```
rounded-full bg-teal-800 px-4 py-2.5 text-sm font-medium text-white
hover:bg-teal-700
```

**Outline button**

```
rounded-full border border-stone-300 bg-white px-4 py-2.5
text-sm font-medium text-stone-800 hover:bg-stone-50
```

**Tabs and filters**

- Track: `rounded-full bg-stone-200/60 p-1`
- Active nav: `bg-[#1a2e24] text-amber-50`
- Active filter chip: `bg-teal-800 text-white`
- Idle: `text-stone-700 hover:bg-white/80` or `bg-stone-100 hover:bg-stone-200`

**Input**

```
rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm
outline-none ring-teal-700/20 focus:bg-white focus:ring-2
```

**Status badges** (`rounded-full px-2.5 py-1 text-xs`)

| State | Classes |
|---|---|
| Success | `bg-emerald-100 text-emerald-900`, row `bg-emerald-50/70` |
| Error | `bg-rose-100 text-rose-900`, row `bg-rose-50/60` |
| Pending | `bg-amber-100 text-amber-950` |
| Neutral | `bg-stone-100 text-stone-700` |
| Warning banner | `border-amber-200 bg-amber-50 text-amber-950` |
| Error banner | `border-rose-200 bg-rose-50 text-rose-900` |

Status dot: `h-2 w-2 rounded-full` in emerald-500, rose-500, or stone-400.

**Summary card**

- Default: `rounded-2xl bg-stone-50 px-4 py-4`
- Accent: `bg-teal-800 text-amber-50`, label `text-teal-100`

**Empty state**

```
rounded-3xl border border-stone-200 bg-white/80 px-5 py-16 text-center text-stone-600
```

## Drop-in CSS

```css
@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;500;600;700&display=swap");
@import "tailwindcss";

@theme {
  --font-sans: "Noto Sans Georgian", ui-sans-serif, system-ui, sans-serif;

  --color-paper: #f4efe6;
  --color-ink: #1a2e24;
  --color-ink-hover: #244033;
  --color-on-ink: #fffbeb;
  --color-accent: #0f766e;
  --color-accent-dark: #115e59;

  --color-foreground: #1c1917;
  --color-muted: #78716c;
  --color-line: #e7e5e4;

  --color-success: #ecfdf5;
  --color-success-text: #064e3b;
  --color-danger: #fff1f2;
  --color-danger-text: #9f1239;
  --color-warning: #fffbeb;
  --color-warning-text: #451a03;
}

:root {
  --background: #f4efe6;
  --foreground: #1c1917;
  --ink: #1a2e24;
  --ink-hover: #244033;
  --on-ink: #fffbeb;
  --accent: #0f766e;
  --accent-dark: #115e59;
}

html,
body {
  min-height: 100%;
  font-family: var(--font-sans);
  color: var(--foreground);
  -webkit-font-smoothing: antialiased;
}

body {
  background:
    radial-gradient(1200px 500px at 10% -10%, rgba(15, 118, 110, 0.08), transparent 50%),
    radial-gradient(900px 400px at 100% 0%, rgba(180, 83, 9, 0.06), transparent 45%),
    var(--background);
}

::selection {
  background: rgba(15, 118, 110, 0.18);
}
```

Tailwind utilities from that theme: `bg-paper`, `bg-ink`, `hover:bg-ink-hover`, `text-on-ink`, `bg-accent`, `bg-accent-dark`, `font-sans`.
