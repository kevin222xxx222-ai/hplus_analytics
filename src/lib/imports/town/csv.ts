export type DecodedCsv = { text: string; encoding: "UTF-8" | "UTF-8_BOM" | "CP932" };

function decode(buffer: Buffer, label: string) {
  return new TextDecoder(label, { fatal: true }).decode(buffer);
}

export function decodeTownCsv(buffer: Buffer): DecodedCsv {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: decode(buffer.subarray(3), "utf-8"), encoding: "UTF-8_BOM" };
  }
  try {
    return { text: decode(buffer, "utf-8"), encoding: "UTF-8" };
  } catch {
    try {
      return { text: decode(buffer, "shift_jis"), encoding: "CP932" };
    } catch {
      throw new Error("CSV文字コードを判定できません。UTF-8、UTF-8 BOM、CP932のいずれかで保存してください。");
    }
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSVの引用符が閉じられていません。");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

