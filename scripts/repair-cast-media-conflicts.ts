import { previewLegacyMediaConflictRepair, repairLegacyMediaConflicts } from "@/lib/casts/membership-service";

function option(name: string) {
  const value = process.argv.find((argument) => argument.startsWith(`${name}=`));
  return value?.slice(name.length + 1);
}

async function main() {
  const castIds = option("--cast-ids")?.split(",").map((id) => id.trim()).filter(Boolean);
  const candidates = await previewLegacyMediaConflictRepair(undefined, castIds);
  console.log("Legacy media conflict repair: PREVIEW");
  for (const candidate of candidates) console.log(JSON.stringify({ cast: candidate.castName, castId: candidate.castId, recordType: candidate.recordType, recordId: candidate.recordId, storeId: candidate.storeId, mediaType: candidate.mediaType, startDate: candidate.startDate, currentEndDate: candidate.currentEndDate, castEndedOn: candidate.castEndedOn, classification: candidate.classification, repair: candidate.repair }));
  const confirmation = option("--confirm");
  if (confirmation !== "REPAIR") {
    console.log(`Preview only. Apply requires --confirm=REPAIR. Candidates: ${candidates.length}`);
    return;
  }
  const result = await repairLegacyMediaConflicts(candidates, confirmation);
  console.log(`Repair completed: updated=${result.updated}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
