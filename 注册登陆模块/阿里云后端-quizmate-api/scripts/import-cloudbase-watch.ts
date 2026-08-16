import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { createPool } from "../src/db.js";
import { WATCH_COLLECTIONS } from "../src/watch/actions.js";

type Document = Record<string, unknown>;
type Dump = { format: string; collections: Record<string, Document[]> };

const inputPath = process.argv[2];
if (!inputPath) throw new Error("usage: tsx scripts/import-cloudbase-watch.ts <export.json>");
const dump = JSON.parse(await readFile(inputPath, "utf8")) as Dump;
if (dump.format !== "quizmate-cloudbase-watch-export-v1" || !dump.collections) throw new Error("invalid watch migration dump");

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const allowed = new Set(Object.values(WATCH_COLLECTIONS));
const counts: Record<string, number> = {};

try {
  await pool.query("BEGIN");
  for (const [collection, documents] of Object.entries(dump.collections)) {
    if (!allowed.has(collection as (typeof WATCH_COLLECTIONS)[keyof typeof WATCH_COLLECTIONS])) continue;
    counts[collection] = 0;
    for (const source of documents) {
      const data = { ...source };
      const documentId = String(data._id ?? crypto.randomUUID());
      delete data._id;
      await pool.query(
        `INSERT INTO watch_documents(collection_name, document_id, data, migrated_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (collection_name, document_id)
         DO UPDATE SET data = EXCLUDED.data, migrated_at = now(), updated_at = now()`,
        [collection, documentId, JSON.stringify(data)]
      );
      counts[collection] += 1;
    }
  }
  await pool.query("COMMIT");
  process.stdout.write(JSON.stringify(counts));
} catch (error) {
  await pool.query("ROLLBACK");
  throw error;
} finally {
  await pool.end();
}
