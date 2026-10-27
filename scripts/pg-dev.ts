import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

async function main() {
  const port = Number(process.env.PGLITE_PORT ?? 5433);
  const dataDir = process.env.PGLITE_DATA ?? ".pgdata";

  const db = await PGlite.create(dataDir);
  const server = new PGLiteSocketServer({
    db,
    port,
    host: "127.0.0.1",
    maxConnections: 10,
  });
  await server.start();
  console.log(`PGlite listening on 127.0.0.1:${port} (data: ${dataDir})`);

  const stop = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
