function option(name: string) { return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1); }
async function main() {
  if (option("--confirm") !== "CONFIRM" || process.env.MEMBERSHIP_J1_CLEANUP_ENABLED !== "true") { console.log("Preview only. Apply requires --confirm=CONFIRM and MEMBERSHIP_J1_CLEANUP_ENABLED=true."); return; }
  if (!option("--cast-id")) throw new Error("--cast-id=<UUID> is required; bulk J1 cleanup is disabled.");
  throw new Error("J1 cleanup requires a reviewed, explicit per-resource repair plan; no automatic date inference or bulk mutation is enabled.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
