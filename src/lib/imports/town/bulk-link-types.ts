export type TownBulkLinkCategory = "A" | "B" | "C" | "D";

export type TownBulkLinkCandidate = {
  key: string;
  category: TownBulkLinkCategory;
  townName: string;
  normalizedName: string;
  storeId: string;
  storeName: string;
  firstDate: string;
  lastDate: string;
  rowCount: number;
  batchCount: number;
  batchIds: string[];
  targetCastId: string | null;
  targetCastName: string | null;
  reason: string;
  reasonCodes: string[];
  conflict: boolean;
  kindCounts: { cast: number; url: number; landing: number };
  sourceUrls: string[];
};

export type TownBulkLinkCastOption = {
  id: string;
  displayName: string;
  normalizedName: string;
  primaryStoreId: string | null;
  primaryStoreName: string | null;
  startedOn: string;
  endedOn: string | null;
  ctiAliases: string[];
  townAliases: string[];
  ctiFrom: string | null;
  ctiTo: string | null;
  townListingStores: string[];
};

export type TownBulkLinkStoreOption = { id: string; name: string };

export type TownBulkLinkImpactPreview = {
  candidateKey: string;
  operation: "EXISTING" | "NEW" | "SKIP" | "PENDING" | "CORRECTION_REVIEW";
  storeName: string;
  townName: string;
  targetCastId: string | null;
  targetCastName: string | null;
  rowCount: number;
  batchCount: number;
  kindCounts: { cast: number; url: number; landing: number };
  firstDate: string;
  lastDate: string;
  aliasAction: string;
  startedOnBefore: string | null;
  startedOnAfter: string | null;
  validFromBefore: string | null;
  validFromAfter: string | null;
  additionalFactCount: number;
  existingFactCount: number;
  conflictCount: number;
  canProceedInPhase2: boolean;
  /** Phase 2 execution gate exposed to the UI/API contract. */
  executable: boolean;
  stopReasons: string[];
  notes: string[];
  skipReason?: string | null;
};

export type TownBulkLinkCategorySummary = {
  peopleCount: number;
  rowCount: number;
  batchCount: number;
};

export type TownBulkLinkPreview = {
  generatedAt: string;
  fingerprint: string;
  categories: Record<TownBulkLinkCategory, TownBulkLinkCategorySummary>;
  idFormat: TownBulkLinkCategorySummary;
  multipleCandidates: TownBulkLinkCategorySummary;
  outsideEnrollment: TownBulkLinkCategorySummary;
  correctionCandidates: TownBulkLinkCategorySummary;
  idNoSourceUrl: TownBulkLinkCategorySummary;
  estimatedWaitingBatchCountAfterA: number;
  estimatedAutoConfirmableFileCountAfterA: number;
  estimatedWaitingBatchCountAfterApprovedB: number;
  estimatedAutoConfirmableFileCountAfterApprovedB: number;
  candidates: TownBulkLinkCandidate[];
  castOptions: TownBulkLinkCastOption[];
  storeOptions: TownBulkLinkStoreOption[];
};

export type TownBulkLinkExecuteInput = {
  category: "A" | "B";
  candidateKeys: string[];
  fingerprint: string;
  userId: string;
};

export type TownBulkLinkCandidateExecuteInput = {
  candidateKey: string;
  fingerprint: string;
  operation: "EXISTING" | "NEW" | "SKIP";
  targetCastId?: string;
  newCastName?: string;
  primaryStoreId?: string;
  newStartedOn?: string;
  note?: string;
  creationReason?: string;
  confirmationText?: string;
  skipReason?: string;
  userId: string;
};
