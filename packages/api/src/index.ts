import { validateEnv } from "@bushpop/config/env";
import { buildServer } from "./server";
import { startWorkers } from "./workers/index.js";

async function start() {
  // Validate all required env vars before anything else.
  // Throws with a clear Zod error listing missing/invalid vars.
  const env = validateEnv();

  const app = await buildServer();

  await startWorkers();

  try {
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    app.log.info(`Server listening on ${env.API_HOST}:${env.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
