export type InventoryClassification = "KEEP" | "COMPATIBILITY_ONLY" | "DEPRECATE" | "REMOVE_SAFE" | "DO_NOT_TOUCH";
export type InventoryReference = { field: string; file: string; purpose: string; classification: InventoryClassification; severity: "P0" | "P1" | "P2" };
export const J4_INVENTORY: InventoryReference[] = [
  { field: "primaryStoreId", file: "src/app/(dashboard)/masters/casts/page.tsx", purpose: "表示用主店舗/Legacy互換", classification: "COMPATIBILITY_ONLY", severity: "P2" },
  { field: "primaryStoreId", file: "src/lib/casts/current-roster.ts", purpose: "表示DTO", classification: "COMPATIBILITY_ONLY", severity: "P2" },
  { field: "status", file: "src/lib/casts/membership-service.ts", purpose: "人物global lifecycle (exit/reentry)", classification: "KEEP", severity: "P2" },
  { field: "startedOn/endedOn", file: "src/lib/imports/town/resolver.ts", purpose: "Historical Legacy fallback", classification: "DO_NOT_TOUCH", severity: "P1" },
  { field: "MEMBERSHIP_READ_MODE", file: "src/lib/casts/membership-read.ts", purpose: "段階移行feature flag", classification: "KEEP", severity: "P2" },
  { field: "TOWN_CAST_MEMBERSHIP_READ_MODE", file: "src/lib/imports/town/service.ts", purpose: "Town current dataset mode", classification: "KEEP", severity: "P2" },
  { field: "startedOn/endedOn", file: "src/lib/analytics", purpose: "Historical/Fact scope compatibility", classification: "DO_NOT_TOUCH", severity: "P1" },
];
export function summarizeJ4Inventory(references = J4_INVENTORY) {
  const count = (classification: InventoryClassification) => references.filter((r) => r.classification === classification).length;
  return { totalReferences: references.length, keep: count("KEEP"), compatibilityOnly: count("COMPATIBILITY_ONLY"), deprecate: count("DEPRECATE"), removeSafe: count("REMOVE_SAFE"), doNotTouch: count("DO_NOT_TOUCH"), primaryStoreIdReferences: references.filter((r) => r.field.includes("primaryStoreId")).length, castStatusReferences: references.filter((r) => r.field === "status").length, startedOnReferences: references.filter((r) => r.field.includes("startedOn")).length, endedOnReferences: references.filter((r) => r.field.includes("endedOn")).length, legacyStoreMembershipUsages: references.filter((r) => r.severity === "P0").length, p0Count: references.filter((r) => r.severity === "P0").length, p1Count: references.filter((r) => r.severity === "P1").length };
}
