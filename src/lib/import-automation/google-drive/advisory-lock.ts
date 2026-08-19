import { createHash } from "node:crypto";
import { Client } from "pg";

export type AdvisoryLockConnection = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows?: Array<{ locked?: boolean }> }>;
  end: () => Promise<void>;
};

export type AdvisoryLockDependencies = {
  connect?: () => Promise<AdvisoryLockConnection>;
};

function lockKeys(value: string): [number, number] {
  const digest = createHash("sha256").update(value).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

async function connectDefault(): Promise<AdvisoryLockConnection> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

export const GLOBAL_SCAN_LOCK_NAME = "HPLUS_DRIVE_SCAN_LOCK";

export async function withAdvisoryLock<T>(name: string, operation: () => Promise<T>, dependencies: AdvisoryLockDependencies = {}): Promise<{ acquired: boolean; result?: T }> {
  const connection = await (dependencies.connect ?? connectDefault)();
  const [key1, key2] = lockKeys(name);
  let acquired = false;
  try {
    const result = await connection.query("SELECT pg_try_advisory_lock($1::integer, $2::integer) AS locked", [key1, key2]);
    acquired = result.rows?.[0]?.locked === true;
    if (!acquired) return { acquired: false };
    return { acquired: true, result: await operation() };
  } finally {
    if (acquired) await connection.query("SELECT pg_advisory_unlock($1::integer, $2::integer)", [key1, key2]);
    await connection.end();
  }
}

export function driveFileLockName(driveFileId: string): string {
  return `HPLUS_DRIVE_FILE:${driveFileId}`;
}
