import { assertEquals } from "@std/assert";
import { AsyncDatabase } from "../../src/storage/async.ts";
import { SQLiteDatabase } from "../../src/storage/sqlite.ts";
import { join } from "@std/path";

async function createTestDb(): Promise<{ db: SQLiteDatabase; asyncDb: AsyncDatabase; cleanup: () => void }> {
  const testDir = join(Deno.makeTempDirSync(), "test.db");
  const db = new SQLiteDatabase({ path: testDir });
  await db.initialize();
  const asyncDb = new AsyncDatabase(db);
  
  return {
    db,
    asyncDb,
    cleanup: () => {
      db.close();
      try {
        Deno.removeSync(testDir);
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

Deno.test("AsyncDatabase - runSql executes statements", async () => {
  const { asyncDb, cleanup } = await createTestDb();

  try {
    await asyncDb.runSql("INSERT INTO memories (id, content, created_at, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?)", "test-1", "Hello", new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
    
    const rows = await asyncDb.query<{ id: string }>("SELECT id FROM memories WHERE id = ?", "test-1");
    assertEquals(rows.length, 1);
    assertEquals(rows[0].id, "test-1");
  } finally {
    cleanup();
  }
});

Deno.test("AsyncDatabase - query returns multiple rows", async () => {
  const { asyncDb, cleanup } = await createTestDb();

  try {
    await asyncDb.runSql("INSERT INTO memories (id, content, created_at, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?)", "test-1", "Content 1", new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
    await asyncDb.runSql("INSERT INTO memories (id, content, created_at, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?)", "test-2", "Content 2", new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

    const rows = await asyncDb.query<{ id: string; content: string }>("SELECT id, content FROM memories ORDER BY id");
    assertEquals(rows.length, 2);
    assertEquals(rows[0].id, "test-1");
    assertEquals(rows[1].id, "test-2");
  } finally {
    cleanup();
  }
});

Deno.test("AsyncDatabase - queryOne returns single row", async () => {
  const { asyncDb, cleanup } = await createTestDb();

  try {
    await asyncDb.runSql("INSERT INTO memories (id, content, created_at, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?)", "test-1", "Hello", new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

    const row = await asyncDb.queryOne<{ id: string; content: string }>("SELECT id, content FROM memories WHERE id = ?", "test-1");
    assertEquals(row?.id, "test-1");
    assertEquals(row?.content, "Hello");
  } finally {
    cleanup();
  }
});

Deno.test("AsyncDatabase - queryOne returns undefined for no match", async () => {
  const { asyncDb, cleanup } = await createTestDb();

  try {
    const row = await asyncDb.queryOne<{ id: string }>("SELECT id FROM memories WHERE id = ?", "nonexistent");
    assertEquals(row, undefined);
  } finally {
    cleanup();
  }
});

Deno.test("AsyncDatabase - serializes operations", async () => {
  const { asyncDb, cleanup } = await createTestDb();

  try {
    const promises: Promise<void>[] = [];
    
    for (let i = 0; i < 10; i++) {
      promises.push(
        asyncDb.runSql(
          "INSERT INTO memories (id, content, created_at, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?)",
          `test-${i}`,
          `Content ${i}`,
          new Date().toISOString(),
          new Date().toISOString(),
          new Date().toISOString()
        )
      );
    }

    await Promise.all(promises);

    const rows = await asyncDb.query<{ id: string }>("SELECT id FROM memories ORDER BY id");
    assertEquals(rows.length, 10);
  } finally {
    cleanup();
  }
});

Deno.test("AsyncDatabase - getQueueLength reflects pending operations", async () => {
  const { asyncDb, cleanup } = await createTestDb();

  try {
    assertEquals(asyncDb.getQueueLength(), 0);
    
    const promise = asyncDb.runSql(
      "INSERT INTO memories (id, content, created_at, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?)",
      "test-1",
      "Content",
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    );
    
    await promise;
    assertEquals(asyncDb.getQueueLength(), 0);
  } finally {
    cleanup();
  }
});
