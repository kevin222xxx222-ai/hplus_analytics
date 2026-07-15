export function normalizeCastName(value: string) {
  return value.normalize("NFKC").replace(/[\s\u3000]+/g, "").trim();
}
