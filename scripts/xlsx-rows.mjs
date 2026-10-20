import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function colNumber(ref) {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function zipPath(target) {
  const cleaned = target.replace(/^\//, "");
  return cleaned.startsWith("xl/") ? cleaned : `xl/${cleaned.replace(/^\.\//, "")}`;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const items = [];
  const open = /<(?:[\w]+:)?si(?:\s[^>]*)?>/gi;
  let match;
  const starts = [];
  while ((match = open.exec(xml))) starts.push(match.index + match[0].length);
  for (let i = 0; i < starts.length; i += 1) {
    const slice = xml.slice(starts[i], starts[i + 1] ?? xml.length);
    const texts = [...slice.matchAll(/<(?:[\w]+:)?t(?:\s[^>]*)?>([^<]*)<\/(?:[\w]+:)?t\s*>/g)].map((part) => decodeXml(part[1]));
    items.push(texts.join(""));
  }
  return items;
}

function cellText(cellXml, shared) {
  const type = /\bt="([^"]+)"/.exec(cellXml)?.[1] ?? "";
  if (type === "inlineStr") {
    return [...cellXml.matchAll(/<(?:[\w]+:)?t(?:\s[^>]*)?>([^<]*)<\/(?:[\w]+:)?t\s*>/g)].map((part) => decodeXml(part[1])).join("").trim();
  }
  const value = /<(?:[\w]+:)?v(?:\s[^>]*)?>([^<]*)<\/(?:[\w]+:)?v\s*>/.exec(cellXml)?.[1] ?? "";
  if (type === "s") return String(shared[Number(value)] ?? "").trim();
  if (type === "str" || type === "b") return decodeXml(value).trim();
  return decodeXml(value).trim();
}

function parseSheetRows(xml, shared) {
  const rows = [];
  const rowChunks = xml.split(/<(?:[\w]+:)?row(?:\s[^>]*)?>/i).slice(1);
  for (const chunk of rowChunks) {
    const cells = [];
    const cellRe = /<(?:[\w]+:)?c\b[^>]*\/>|<(?:[\w]+:)?c\b[^>]*>[\s\S]*?<\/(?:[\w]+:)?c\s*>/g;
    let match;
    while ((match = cellRe.exec(chunk))) {
      const cellXml = match[0];
      const ref = /\br="([A-Z]+\d+)"/i.exec(cellXml)?.[1];
      if (!ref) continue;
      cells[colNumber(ref)] = cellText(cellXml, shared);
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

export async function readWorkbookSheets(path) {
  const zip = await JSZip.loadAsync(await readFile(path));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relsXml) throw new Error("Excel ფაილი არ იკითხება");
  const sheets = [];
  const sheetRe = /<(?:[\w]+:)?sheet\b[^>]*\/?>/g;
  let tag;
  while ((tag = sheetRe.exec(workbookXml))) {
    const name = /name="([^"]*)"/.exec(tag[0])?.[1];
    const rid = /r:id="([^"]*)"/.exec(tag[0])?.[1];
    if (name && rid) sheets.push({ name: decodeXml(name), rid });
  }
  const targets = new Map();
  const relRe = /<Relationship\b[^>]*>/g;
  while ((tag = relRe.exec(relsXml))) {
    const id = /\bId="([^"]*)"/.exec(tag[0])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(tag[0])?.[1];
    if (id && target) targets.set(id, zipPath(target));
  }
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const shared = parseSharedStrings(sharedFile ? await sharedFile.async("string") : "");
  const out = [];
  for (const sheet of sheets) {
    const file = zip.file(targets.get(sheet.rid) ?? "");
    if (!file) continue;
    out.push({ name: sheet.name, rows: parseSheetRows(await file.async("string"), shared) });
  }
  return out;
}

const SKIP_SHEETS = /^(შეჯამება|lists|სიები|სტატუსები|sheet\d+)$/i;

export async function readDataSheet(path) {
  const sheets = await readWorkbookSheets(path);
  const chosen = sheets.find((sheet) => !SKIP_SHEETS.test(sheet.name)) ?? sheets[0];
  if (!chosen) throw new Error("ფურცელი არ არის");
  return chosen;
}
