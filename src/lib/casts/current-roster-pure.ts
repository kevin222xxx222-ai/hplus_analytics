import { CastMembershipStatus } from "@/generated/prisma/client";
export function isCurrentRosterMember(memberships: Array<{ storeId: string; status: CastMembershipStatus }>, storeId: string) { return memberships.some((membership) => membership.storeId === storeId && (membership.status === CastMembershipStatus.ACTIVE || membership.status === CastMembershipStatus.ON_LEAVE)); }
