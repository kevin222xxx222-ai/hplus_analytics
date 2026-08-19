import {
  DriveFolderMappingPriority,
  ImportDataType,
  MediaType,
  PrismaClient,
  StoreCode,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const HEAVEN_METRIC_HINTS = new Set(["PAGE_ACCESS", "DIARY_POSTS", "MY_GIRL", "MITENE_SENT", "OKINI_TALK_SENT", "ATTENDANCE_NOTICE", "DIARY_NOTICE"]);

export type DriveFolderMappingInput = {
  driveFolderId: string;
  displayName: string;
  importSourceId: string;
  storeId?: string | null;
  importDataType: ImportDataType;
  metricHint?: string | null;
  priority?: DriveFolderMappingPriority;
  isActive?: boolean;
  isFuture?: boolean;
};

type MappingDb = Pick<PrismaClient, "importSource" | "driveFolderMapping">;

const mappingInclude = {
  importSource: { include: { store: true } },
  store: true,
} as const;

export function validateDriveFolderMappingInput(input: DriveFolderMappingInput, source: { mediaType: MediaType; dataType: ImportDataType; storeId: string | null; store?: { code: StoreCode } | null }) {
  if (!input.driveFolderId.trim()) throw new Error("driveFolderId is required.");
  if (!input.displayName.trim()) throw new Error("displayName is required.");

  const priority = input.priority ?? DriveFolderMappingPriority.REQUIRED;
  const isFuture = input.isFuture ?? false;
  if ((priority === DriveFolderMappingPriority.FUTURE) !== isFuture) throw new Error("priority FUTURE and isFuture must agree.");
  if (source.mediaType === MediaType.CTI) {
    if (input.importDataType !== ImportDataType.CTI_CAST_REPORT || source.dataType !== ImportDataType.CTI_CAST_REPORT) throw new Error("CTI mapping must use CTI_CAST_REPORT.");
    if (input.storeId || source.storeId || input.metricHint) throw new Error("CTI mapping must not specify a store or metricHint.");
    return;
  }
  if (source.mediaType !== (input.importDataType === ImportDataType.HEAVEN_STORE || input.importDataType === ImportDataType.HEAVEN_CAST ? MediaType.HEAVEN : MediaType.TOWN)) throw new Error("ImportSource mediaType and mapping dataType do not match.");
  if (source.dataType !== input.importDataType) throw new Error("ImportSource dataType and mapping dataType do not match.");
  if (!input.storeId || input.storeId !== source.storeId) throw new Error("Mapping storeId must match ImportSource storeId.");
  if (source.store?.code === StoreCode.NODA || source.store?.code === StoreCode.KUKI) throw new Error("This store is not an H4 Drive mapping target.");
  if (source.mediaType === MediaType.TOWN && input.metricHint) throw new Error("Town mapping must not specify metricHint.");
  if (source.mediaType === MediaType.HEAVEN) {
    if (source.store?.code !== StoreCode.KASUKABE) throw new Error("Heaven Drive mapping is restricted to Kasukabe.");
    if (input.importDataType === ImportDataType.HEAVEN_STORE && input.metricHint) throw new Error("Heaven Shop mapping must not specify metricHint.");
    if (input.importDataType === ImportDataType.HEAVEN_CAST && (!input.metricHint || !HEAVEN_METRIC_HINTS.has(input.metricHint))) throw new Error("Heaven Girl mapping requires a valid metricHint.");
  }
}

export async function upsertDriveFolderMapping(input: DriveFolderMappingInput, db: MappingDb = prisma) {
  const source = await db.importSource.findUnique({ where: { id: input.importSourceId }, include: { store: true } });
  if (!source) throw new Error("ImportSource was not found.");
  validateDriveFolderMappingInput(input, source);

  const priority = input.priority ?? DriveFolderMappingPriority.REQUIRED;
  const isFuture = input.isFuture ?? priority === DriveFolderMappingPriority.FUTURE;
  return db.driveFolderMapping.upsert({
    where: { driveFolderId: input.driveFolderId.trim() },
    create: {
      driveFolderId: input.driveFolderId.trim(), displayName: input.displayName.trim(), importSourceId: input.importSourceId,
      storeId: input.storeId ?? null, importDataType: input.importDataType, metricHint: input.metricHint ?? null,
      priority, isActive: input.isActive ?? true, isFuture,
    },
    update: {
      displayName: input.displayName.trim(), importSourceId: input.importSourceId, storeId: input.storeId ?? null,
      importDataType: input.importDataType, metricHint: input.metricHint ?? null, priority,
      isActive: input.isActive ?? true, isFuture,
    },
    include: mappingInclude,
  });
}

export async function resolveDriveFolderMapping(folderId: string, db: MappingDb = prisma) {
  if (!folderId.trim()) throw new Error("driveFolderId is required.");
  const mapping = await db.driveFolderMapping.findUnique({ where: { driveFolderId: folderId.trim() }, include: mappingInclude });
  if (!mapping) throw new Error("Drive Folder is UNMAPPED.");
  return mapping;
}

export async function listActiveDriveFolderMappings(db: MappingDb = prisma) {
  return db.driveFolderMapping.findMany({ where: { isActive: true, isFuture: false }, orderBy: [{ priority: "asc" }, { displayName: "asc" }], include: mappingInclude });
}
