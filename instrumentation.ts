/**
 * Next.js instrumentation hook — runs once when the server process boots.
 * We use it to start the free-tier health scheduler (Hermes' standing job),
 * guarded to the Node.js runtime so it never tries to run on the edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startHealthScheduler } = await import("./lib/health");
  startHealthScheduler();
  const { startCronScheduler } = await import("./lib/cron");
  startCronScheduler();
  const { logEvent } = await import("./lib/logbook");
  logEvent({ source: "system", level: "success", event: "Mission Control server started" });
}
