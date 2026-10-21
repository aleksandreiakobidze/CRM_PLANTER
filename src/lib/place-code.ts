const KA: Record<string, string> = {
  "\u10d0": "a",
  "\u10d1": "b",
  "\u10d2": "g",
  "\u10d3": "d",
  "\u10d4": "e",
  "\u10d5": "v",
  "\u10d6": "z",
  "\u10d7": "t",
  "\u10d8": "i",
  "\u10d9": "k",
  "\u10da": "l",
  "\u10db": "m",
  "\u10dc": "n",
  "\u10dd": "o",
  "\u10de": "p",
  "\u10df": "zh",
  "\u10e0": "r",
  "\u10e1": "s",
  "\u10e2": "t",
  "\u10e3": "u",
  "\u10e4": "p",
  "\u10e5": "k",
  "\u10e6": "gh",
  "\u10e7": "q",
  "\u10e8": "sh",
  "\u10e9": "ch",
  "\u10ea": "ts",
  "\u10eb": "dz",
  "\u10ec": "ts",
  "\u10ed": "ch",
  "\u10ee": "kh",
  "\u10ef": "j",
  "\u10f0": "h",
};

export function cleanPlaceCode(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

export function slugPlaceCode(name: string) {
  const raw = [...cleanPlaceCode(name).toLocaleLowerCase("ka")]
    .map((ch) => KA[ch] ?? (/[a-z0-9]/.test(ch) ? ch : ch === " " || ch === "-" ? "-" : ""))
    .join("");
  return raw.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "item";
}

export function nextPlaceCode(name: string, taken: Set<string>) {
  const root = slugPlaceCode(name);
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export function rememberPlaceCode(taken: Set<string>, code: string) {
  const key = cleanPlaceCode(code).toLocaleLowerCase("ka");
  if (key) taken.add(key);
}

export function placeCodeTaken(taken: Set<string>, code: string) {
  return taken.has(cleanPlaceCode(code).toLocaleLowerCase("ka"));
}
