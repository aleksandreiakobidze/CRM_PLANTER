# Design guide

TailAdmin default admin look. Light gray canvas, white cards, brand blue `#465fff`. Dark mode uses `html.dark`. Corners are moderate. Numbers use tabular figures.

## Font

Noto Sans Georgian, weights 400, 600, 700. Local files only. `lang="ka"`, antialiased. No Google Fonts.

## Colors

| Role | Light | Dark |
|---|---|---|
| Page | `#f9fafb` gray-50 | `#0c111d` gray-950 |
| Card | `#ffffff` | `#1a2231` |
| Text | `#101828` gray-900 | `#f2f4f7` |
| Muted | `#667085` gray-500 | `#98a2b3` |
| Border | `#e4e7ec` gray-200 | `#344054` |
| Brand | `#465fff` | `#7592ff` |
| Brand hover | `#3641f5` | `#9cb9ff` |
| On brand | `#ffffff` | `#ffffff` |
| Success | `#12b76a` / `#ecfdf3` | `#32d583` |
| Error | `#f04438` / `#fef3f2` | `#f97066` |
| Warning | `#f79009` / `#fffaeb` | `#fdb022` |

## Type

| Element | Size | Weight |
|---|---|---|
| Page title | 24px | 700 |
| Card title | 18px | 600 |
| Body | 14px | 400 |
| Table header | 12px | 600 |
| Amount | 16–26px | 600–700 tabular-nums |

## Layout

- Sidebar 290px, compact 90px
- Header sticky, white / gray-dark, 1px bottom border
- Main padding 16–24px
- Card radius 16px, input radius 8px, button radius 8px
- Card shadow `0 1px 3px rgba(16,24,40,0.1), 0 1px 2px rgba(16,24,40,0.06)`

## Components

**Primary button:** brand-500, white text, 8px radius.

**Secondary button:** white / gray-dark, gray-300 border.

**Active nav:** brand-50 background, brand-500 text. Dark: brand-500 at 12% opacity.

**Input:** gray-300 border, focus ring `rgba(70,95,255,0.12)`.

**Theme:** `planter-theme` in localStorage, `html.dark` class.
