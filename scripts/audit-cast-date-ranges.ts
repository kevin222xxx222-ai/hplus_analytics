import { auditCastMediaStateConflicts } from "@/lib/casts/membership-service";

async function main() {
  const result = await auditCastMediaStateConflicts();
  console.log("Cast date-range audit: READ-ONLY");
  console.log(`Alias validTo < validFrom: ${result.aliasCount}`);
  console.log(`MediaListing listedTo < listedFrom: ${result.listingCount}`);
  console.log(`Retired Cast with current Alias: ${result.retiredCurrentAliasCount}`);
  console.log(`Retired Cast with current MediaListing: ${result.retiredCurrentListingCount}`);
  console.log(`All-LEFT Cast with current Alias: ${result.allLeftCurrentAliasCount}`);
  console.log(`All-LEFT Cast with current MediaListing: ${result.allLeftCurrentListingCount}`);
  if (result.aliasCount || result.listingCount || result.retiredCurrentAliasCount || result.retiredCurrentListingCount) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
