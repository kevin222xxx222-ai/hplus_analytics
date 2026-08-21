import { CastMembershipStatus, CastStatus } from "@/generated/prisma/client";

export type MembershipEvidence = {
  storeIds: string[];
  sourceKinds: string[];
  dateRanges: Array<{ sourceKind: string; storeId: string | null; from: Date | null; to: Date | null }>;
};

export type BackfillClassification =
  | "SAFE_AUTO"
  | "SAFE_LEFT"
  | "MULTI_STORE_CANDIDATE"
  | "DATE_UNCERTAIN"
  | "STORE_UNCERTAIN"
  | "EXISTING_MEMBERSHIP";

export type BackfillAuditCast = {
  id: string;
  displayName: string;
  status: CastStatus;
  startedOn: Date;
  endedOn: Date | null;
  primaryStoreId: string | null;
  membershipCount: number;
  evidence: MembershipEvidence;
};

export type BackfillAuditResult = BackfillAuditCast & {
  classification: BackfillClassification;
  reason: string;
  sourceConfidence: "CONFIRMED" | "INFERRED" | null;
  proposedStatus: CastMembershipStatus | null;
};

/**
 * Classifies legacy Cast data only. It never mutates a Cast or Membership.
 * Legacy date fields have no provenance column, so callers must explicitly
 * opt in to treating them as trusted before SAFE_AUTO/SAFE_LEFT is returned.
 */
export function classifyCastForMembershipBackfill(input: BackfillAuditCast, trustedLegacyDates = false): BackfillAuditResult {
  const storeIds = [...new Set(input.evidence.storeIds.filter(Boolean))];
  const dateOrderValid = !input.endedOn || input.startedOn <= input.endedOn;

  if (input.membershipCount > 0) {
    return { ...input, classification: "EXISTING_MEMBERSHIP", reason: "既存MembershipがあるためBackfill対象外です。", sourceConfidence: null, proposedStatus: null };
  }
  if (storeIds.length > 1) {
    return { ...input, classification: "MULTI_STORE_CANDIDATE", reason: "複数店舗に所属・掲載されている可能性があるため、店舗別に確認します。", sourceConfidence: null, proposedStatus: null };
  }
  if (storeIds.length === 0 || !input.primaryStoreId) {
    return { ...input, classification: "STORE_UNCERTAIN", reason: "primaryStoreまたは店舗根拠がありません。", sourceConfidence: null, proposedStatus: null };
  }
  if (!dateOrderValid || !trustedLegacyDates) {
    return { ...input, classification: "DATE_UNCERTAIN", reason: !dateOrderValid ? "開始日が退店日より後です。" : "Legacy日付の根拠が未確認です。Fact等から日付を推測しません。", sourceConfidence: null, proposedStatus: null };
  }
  if (input.status === CastStatus.ACTIVE && !input.endedOn) {
    return { ...input, classification: "SAFE_AUTO", reason: "単一店舗・ACTIVE・終了日なしで、Legacy日付を信頼済みとして扱います。", sourceConfidence: "INFERRED", proposedStatus: CastMembershipStatus.ACTIVE };
  }
  if (input.status === CastStatus.INACTIVE && input.endedOn) {
    return { ...input, classification: "SAFE_LEFT", reason: "単一店舗・INACTIVE・開始日と退店日があり、Legacy日付を信頼済みとして扱います。", sourceConfidence: "INFERRED", proposedStatus: CastMembershipStatus.LEFT };
  }
  return { ...input, classification: "DATE_UNCERTAIN", reason: "Cast状態と日付の組み合わせを自動確定できません。", sourceConfidence: null, proposedStatus: null };
}

export function summarizeBackfillAudit(results: BackfillAuditResult[]) {
  const summary = {
    totalCasts: results.length,
    safeAuto: 0,
    safeLeft: 0,
    multiStore: 0,
    dateUncertain: 0,
    storeUncertain: 0,
    alreadyMigrated: 0,
  };
  for (const result of results) {
    if (result.classification === "SAFE_AUTO") summary.safeAuto += 1;
    else if (result.classification === "SAFE_LEFT") summary.safeLeft += 1;
    else if (result.classification === "MULTI_STORE_CANDIDATE") summary.multiStore += 1;
    else if (result.classification === "DATE_UNCERTAIN") summary.dateUncertain += 1;
    else if (result.classification === "STORE_UNCERTAIN") summary.storeUncertain += 1;
    else if (result.classification === "EXISTING_MEMBERSHIP") summary.alreadyMigrated += 1;
  }
  return summary;
}
