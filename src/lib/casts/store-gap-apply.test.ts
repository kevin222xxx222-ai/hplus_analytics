import { CastMembershipStatus, CastStatus } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { selectTownStoreGapCandidates } from "@/lib/casts/store-gap-apply";

const base = { castId: "cast", storeId: "koshigaya", displayName: "A", storeName: "越谷", legacyStatus: CastStatus.ACTIVE, legacyEndedOn: null, primaryStoreId: null, membershipFree: true, existingMembershipCount: 0, existingMembershipStatuses: [], sources: ["TOWN_CAST"], datasets: [], townCurrent: true, townLatestDatasetDate: new Date("2026-08-22"), townImportBatchId: "batch", ctiCurrent: false, ctiLatestDatasetDate: null, ctiImportBatchId: null, aliasEvidence: false, currentAliasCount: 0, mediaListingEvidence: false, currentMediaListingCount: 0, heavenEvidence: false, displayNameRetiredMarker: false, legacyConflict: false, action: "CREATE_ACTIVE" as const, decision: "CREATE_ACTIVE" as const, reviewReasons: [] };

describe("Town store gap selection", () => {
  it("selects only strong current Town rows", () => {
    expect(selectTownStoreGapCandidates([base], "koshigaya")).toHaveLength(1);
    expect(selectTownStoreGapCandidates([{ ...base, storeId: "kasukabe" }], "koshigaya")).toHaveLength(0);
    expect(selectTownStoreGapCandidates([{ ...base, townCurrent: false }], "koshigaya")).toHaveLength(0);
    expect(selectTownStoreGapCandidates([{ ...base, existingMembershipCount: 1, existingMembershipStatuses: [CastMembershipStatus.ACTIVE] }], "koshigaya", new Map([["cast", [CastMembershipStatus.ACTIVE]]]))).toHaveLength(0);
  });

  it("excludes retired, conflict, review and non-create rows", () => {
    expect(selectTownStoreGapCandidates([{ ...base, displayNameRetiredMarker: true }, { ...base, castId: "b", legacyStatus: CastStatus.INACTIVE }, { ...base, castId: "c", legacyConflict: true }, { ...base, castId: "d", action: "REVIEW_REQUIRED", decision: "REVIEW_REQUIRED" }], "koshigaya")).toHaveLength(0);
  });
});
