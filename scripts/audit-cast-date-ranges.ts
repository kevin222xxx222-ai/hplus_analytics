import { auditCastDateRangeConflicts } from "@/lib/casts/membership-service";

const result = await auditCastDateRangeConflicts();
console.log("Cast date-range audit: READ-ONLY");
console.log(`Alias validTo < validFrom: ${result.aliasCount}`);
console.log(`MediaListing listedTo < listedFrom: ${result.listingCount}`);
if (result.aliasCount || result.listingCount) process.exitCode = 2;
