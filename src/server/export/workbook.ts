import ExcelJS from "exceljs";
import { formatInTimeZone } from "date-fns-tz";
import { BUSINESS_TIME_ZONE } from "@/server/time";

const FONT = "Sylfaen";
const GREEN = "FF14532D";
const HEADER = "FF166534";
const PAPER = "FFF3F6F3";
const ZEBRA = "FFF7FAF8";
const TOTAL = "FFE7F0EA";
const LINE = "FFD7E3DA";
const WHITE = "FFFFFFFF";
const MUTED = "FF5C6B62";
const INK = "FF1C1917";
const LINK = "FF166534";

export type SheetKind = "text" | "phone" | "money" | "qty" | "cost" | "int" | "date";

export type SheetColumn = {
  header: string;
  kind?: SheetKind;
  width?: number;
  wrap?: boolean;
  total?: boolean;
};

export type SheetCell = string | number | Date | null | { text: string; href?: string; color?: string };

export type SheetSpec = {
  name: string;
  columns: SheetColumn[];
  rows: SheetCell[][];
};

const NUM_FMT: Partial<Record<SheetKind, string>> = {
  phone: "@",
  money: "#,##0.00",
  qty: "#,##0.000",
  cost: "#,##0.0000",
  int: "#,##0",
  date: "yyyy-mm-dd",
};

function columnLetter(index: number) {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cellLength(value: SheetCell): number {
  if (value == null) return 0;
  if (value instanceof Date) return 12;
  if (typeof value === "number") return String(value).length + 3;
  if (typeof value === "object") return value.text.length;
  return value.length;
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(color = LINE): Partial<ExcelJS.Borders> {
  const edge = { style: "thin" as const, color: { argb: color } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

export async function buildWorkbook(input: { title: string; note?: string; sheets: SheetSpec[] }): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Planter CRM";
  workbook.created = new Date();
  workbook.modified = new Date();
  const stamped = formatInTimeZone(new Date(), BUSINESS_TIME_ZONE, "yyyy-MM-dd HH:mm");

  for (const spec of input.sheets) {
    const width = Math.max(spec.columns.length, 1);
    const sheet = workbook.addWorksheet(spec.name, {
      views: [{ state: "frozen", ySplit: 3, showGridLines: false, activeCell: "A4" }],
      properties: { tabColor: { argb: GREEN }, defaultRowHeight: 20 },
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        printTitlesRow: "1:3",
        horizontalCentered: true,
        margins: { left: 0.4, right: 0.4, top: 0.7, bottom: 0.6, header: 0.28, footer: 0.28 },
      },
      headerFooter: {
        oddHeader: `&L&"Sylfaen,Bold"Planter&C&"Sylfaen"&B${input.title}&R&"Sylfaen"&D`,
        oddFooter: `&L&"Sylfaen"${spec.name}&R&"Sylfaen"გვერდი &P / &N`,
      },
    });

    sheet.mergeCells(1, 1, 1, width);
    sheet.mergeCells(2, 1, 2, width);
    const banner = sheet.getRow(1);
    banner.height = 32;
    const meta = sheet.getRow(2);
    meta.height = 20;
    const note = [input.note, `${spec.rows.length} ჩანაწერი`].filter(Boolean).join(" · ");
    for (let column = 1; column <= width; column += 1) {
      const top = sheet.getCell(1, column);
      top.fill = fill(GREEN);
      top.font = { name: FONT, size: 16, bold: true, color: { argb: WHITE } };
      top.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      const sub = sheet.getCell(2, column);
      sub.fill = fill(PAPER);
      sub.font = { name: FONT, size: 10, color: { argb: MUTED } };
      sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }
    sheet.getCell(1, 1).value = input.title;
    sheet.getCell(2, 1).value = `Planter CRM · ${stamped} · ${note}`;

    const header = sheet.getRow(3);
    header.height = 24;
    spec.columns.forEach((column, index) => {
      const cell = header.getCell(index + 1);
      cell.value = column.header;
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: WHITE } };
      cell.fill = fill(HEADER);
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = thinBorder("FF1F7A43");
    });

    spec.rows.forEach((row, rowIndex) => {
      const excelRow = sheet.getRow(rowIndex + 4);
      const longest = Math.max(...spec.columns.map((column, index) => (column.wrap ? cellLength(row[index] ?? null) : 0)), 0);
      excelRow.height = longest > 42 ? 36 : 22;
      spec.columns.forEach((column, index) => {
        const cell = excelRow.getCell(index + 1);
        const value = row[index] ?? null;
        const zebra = rowIndex % 2 === 1;
        cell.fill = fill(zebra ? ZEBRA : WHITE);
        cell.border = thinBorder();
        cell.alignment = {
          vertical: column.wrap ? "top" : "middle",
          horizontal: column.kind === "text" || column.kind === "phone" || !column.kind ? "left" : "right",
          wrapText: Boolean(column.wrap),
          indent: column.kind === "text" || column.kind === "phone" || !column.kind ? 1 : 0,
        };
        const format = column.kind ? NUM_FMT[column.kind] : undefined;
        if (format) cell.numFmt = format;
        writeCell(cell, value, column.kind);
      });
    });

    const lastData = Math.max(3, 3 + spec.rows.length);
    if (spec.rows.length > 0 && spec.columns.some((column) => column.total)) {
      const totalRow = sheet.getRow(lastData + 1);
      totalRow.height = 22;
      spec.columns.forEach((column, index) => {
        const cell = totalRow.getCell(index + 1);
        cell.fill = fill(TOTAL);
        cell.border = thinBorder("FF166534");
        cell.font = { name: FONT, size: 11, bold: true, color: { argb: INK } };
        cell.alignment = { vertical: "middle", horizontal: index === 0 ? "left" : "right", indent: index === 0 ? 1 : 0 };
        if (index === 0 && !column.total) cell.value = "ჯამი";
        if (column.total) {
          const letter = columnLetter(index + 1);
          cell.value = { formula: `SUBTOTAL(109,${letter}4:${letter}${lastData})` };
          const format = column.kind ? NUM_FMT[column.kind] : undefined;
          if (format) cell.numFmt = format;
        }
      });
    }

    if (spec.columns.length > 0) {
      sheet.autoFilter = {
        from: { row: 3, column: 1 },
        to: { row: lastData, column: spec.columns.length },
      };
    }

    spec.columns.forEach((column, index) => {
      const samples = spec.rows.map((row) => cellLength(row[index] ?? null));
      const fitted = Math.max(column.header.length + 2, ...samples, column.width ?? 12) + 1;
      const cap = column.wrap ? 42 : 36;
      sheet.getColumn(index + 1).width = Math.min(cap, Math.max(12, fitted));
    });
  }

  const raw = await workbook.xlsx.writeBuffer();
  return new Uint8Array(raw);
}

function writeCell(cell: ExcelJS.Cell, value: SheetCell, kind: SheetKind | undefined) {
  if (value == null || value === "") {
    cell.value = null;
    cell.font = { name: FONT, size: 11, color: { argb: INK } };
    return;
  }
  if (value instanceof Date) {
    cell.value = value;
    cell.font = { name: FONT, size: 11, color: { argb: INK } };
    return;
  }
  if (typeof value === "number") {
    cell.value = value;
    cell.font = { name: FONT, size: 11, color: { argb: INK } };
    return;
  }
  if (typeof value === "object") {
    cell.value = value.href ? { text: value.text, hyperlink: value.href } : value.text;
    cell.font = {
      name: FONT,
      size: 11,
      color: { argb: value.href ? LINK : value.color ?? INK },
      underline: Boolean(value.href),
      bold: Boolean(value.color),
    };
    return;
  }
  cell.value = value;
  cell.font = { name: FONT, size: 11, color: { argb: kind === "phone" ? INK : INK } };
}

export function excelDate(value: Date | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.toISOString().slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function excelNumber(value: { toString(): string } | null | undefined, places: number): number | null {
  if (value == null) return null;
  const text = value.toString();
  if (!text) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(places));
}

export function contentDisposition(filename: string, fallback: string) {
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
