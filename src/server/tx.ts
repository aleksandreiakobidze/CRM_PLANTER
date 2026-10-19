import { getDb, type Tx } from "@/server/db";
import { isRetryableTransaction } from "@/server/errors";

export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = getDb();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: 20_000,
      });
    } catch (error) {
      lastError = error;
      if (attempt < 2 && isRetryableTransaction(error)) continue;
      throw error;
    }
  }
  throw lastError;
}
