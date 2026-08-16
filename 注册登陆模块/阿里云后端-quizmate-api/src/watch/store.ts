import crypto from "node:crypto";
import type { Database } from "../db.js";

export type WatchDocument = Record<string, unknown> & { _id: string };

function withoutId(document: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...document };
  delete copy._id;
  return copy;
}

export class WatchStore {
  constructor(private readonly db: Database) {}

  async add(collection: string, document: Record<string, unknown>): Promise<WatchDocument> {
    const documentId = String(document._id ?? crypto.randomUUID());
    const data = withoutId(document);
    await this.db.query(
      `INSERT INTO watch_documents(collection_name, document_id, data)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (collection_name, document_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [collection, documentId, JSON.stringify(data)]
    );
    return { _id: documentId, ...data };
  }

  async list(
    collection: string,
    where: Record<string, unknown> = {},
    limit = 1000,
    sortField?: string,
    descending = false
  ): Promise<WatchDocument[]> {
    const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit)));
    const order = sortField
      ? `ORDER BY data ->> $3 ${descending ? "DESC" : "ASC"} NULLS LAST`
      : "ORDER BY created_at ASC";
    const values: unknown[] = [collection, JSON.stringify(where)];
    if (sortField) values.push(sortField);
    values.push(safeLimit);
    const limitIndex = values.length;
    const result = await this.db.query<{ document_id: string; data: Record<string, unknown> }>(
      `SELECT document_id, data FROM watch_documents
        WHERE collection_name = $1 AND data @> $2::jsonb
        ${order} LIMIT $${limitIndex}`,
      values
    );
    return result.rows.map((row) => ({ _id: row.document_id, ...row.data }));
  }

  async findOne(collection: string, where: Record<string, unknown>): Promise<WatchDocument | null> {
    return (await this.list(collection, where, 1))[0] ?? null;
  }

  async updateById(collection: string, documentId: string, patch: Record<string, unknown>): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE watch_documents SET data = data || $3::jsonb, updated_at = now()
        WHERE collection_name = $1 AND document_id = $2`,
      [collection, documentId, JSON.stringify(withoutId(patch))]
    );
    return Boolean(result.rowCount);
  }

  async updateWhere(collection: string, where: Record<string, unknown>, patch: Record<string, unknown>): Promise<number> {
    const result = await this.db.query(
      `UPDATE watch_documents SET data = data || $3::jsonb, updated_at = now()
        WHERE collection_name = $1 AND data @> $2::jsonb`,
      [collection, JSON.stringify(where), JSON.stringify(withoutId(patch))]
    );
    return result.rowCount ?? 0;
  }

  async removeById(collection: string, documentId: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM watch_documents WHERE collection_name = $1 AND document_id = $2",
      [collection, documentId]
    );
    return Boolean(result.rowCount);
  }

  async removeWhere(collection: string, where: Record<string, unknown>): Promise<number> {
    const result = await this.db.query(
      "DELETE FROM watch_documents WHERE collection_name = $1 AND data @> $2::jsonb",
      [collection, JSON.stringify(where)]
    );
    return result.rowCount ?? 0;
  }
}
