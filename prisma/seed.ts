import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { ImportDataType, ImportSourceKind, MediaType, PrismaClient, StoreCode, UserRole } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const stores = [
    { code: StoreCode.KASUKABE, name: "若妻淫乱倶楽部春日部店", shortName: "春日部", displayOrder: 1, hasManagementMetrics: true, hasAcquisitionMetrics: true },
    { code: StoreCode.KOSHIGAYA, name: "若妻淫乱倶楽部越谷店", shortName: "越谷", displayOrder: 2, hasManagementMetrics: true, hasAcquisitionMetrics: true },
    { code: StoreCode.NODA, name: "若妻淫乱倶楽部野田店", shortName: "野田", displayOrder: 3, hasManagementMetrics: true, hasAcquisitionMetrics: false },
    { code: StoreCode.KUKI, name: "久喜", shortName: "久喜", displayOrder: 4, hasManagementMetrics: false, hasAcquisitionMetrics: false },
  ];

  for (const store of stores) {
    await prisma.store.upsert({ where: { code: store.code }, update: store, create: store });
  }

  await prisma.importSource.upsert({
    where: { name: "CTI女子別レポート（3店舗）" },
    update: { isActive: true, kind: ImportSourceKind.MANUAL_UPLOAD, mediaType: MediaType.CTI, dataType: ImportDataType.CTI_CAST_REPORT },
    create: { name: "CTI女子別レポート（3店舗）", kind: ImportSourceKind.MANUAL_UPLOAD, mediaType: MediaType.CTI, dataType: ImportDataType.CTI_CAST_REPORT },
  });

  const acquisitionStores = await prisma.store.findMany({
    where: { code: { in: [StoreCode.KASUKABE, StoreCode.KOSHIGAYA] } },
    select: { id: true, code: true, shortName: true },
  });
  const townSourceTypes = [
    { label: "店舗別", dataType: ImportDataType.TOWN_STORE, metricType: "STORE" },
    { label: "女子別", dataType: ImportDataType.TOWN_CAST, metricType: "CAST" },
    { label: "URL別", dataType: ImportDataType.TOWN_URL, metricType: "URL" },
    { label: "LP別", dataType: ImportDataType.TOWN_LANDING, metricType: "LANDING" },
  ];
  for (const store of acquisitionStores) {
    for (const sourceType of townSourceTypes) {
      const name = `タウン${store.shortName}・${sourceType.label}`;
      const data = {
        name,
        kind: ImportSourceKind.MANUAL_UPLOAD,
        mediaType: MediaType.TOWN,
        dataType: sourceType.dataType,
        metricType: sourceType.metricType,
        storeId: store.id,
        isActive: true,
      };
      await prisma.importSource.upsert({ where: { name }, update: data, create: data });
    }
  }

  const loginId = process.env.INITIAL_ADMIN_LOGIN_ID;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (loginId && password) {
    if (password.length < 12) throw new Error("INITIAL_ADMIN_PASSWORD must be at least 12 characters");
    await prisma.user.upsert({
      where: { loginId },
      update: { isActive: true, role: UserRole.ADMIN },
      create: {
        loginId,
        email: process.env.INITIAL_ADMIN_EMAIL || null,
        displayName: process.env.INITIAL_ADMIN_NAME || "管理者",
        passwordHash: await hash(password, 12),
        role: UserRole.ADMIN,
      },
    });
    console.log(`Initial admin ensured: ${loginId}`);
  } else {
    console.log("Initial admin skipped. Set INITIAL_ADMIN_LOGIN_ID and INITIAL_ADMIN_PASSWORD to create one.");
  }
}

main().finally(() => prisma.$disconnect());
