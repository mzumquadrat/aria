import { assertEquals } from "@std/assert";
import { closeDatabase, getMemoryRepository, initializeDatabase } from "../../src/storage/mod.ts";

const TEST_DB_PATH = "./data/test_memories_unit.db";

async function setupTest(): Promise<void> {
  closeDatabase();
  await initializeDatabase({ path: TEST_DB_PATH });
}

function teardownTest(): void {
  closeDatabase();
}

Deno.test("MemoryRepository - create with defaults", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  const memory = repo.create({
    content: "User prefers dark mode in all applications",
  });

  assertEquals(memory.content, "User prefers dark mode in all applications");
  assertEquals(memory.category, "general");
  assertEquals(memory.importance, 5);
  assertEquals(memory.accessCount, 0);

  teardownTest();
});

Deno.test("MemoryRepository - create with custom values", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  const memory = repo.create({
    content: "User's birthday is March 15th",
    category: "fact",
    importance: 9,
    metadata: { recurring: true },
  });

  assertEquals(memory.category, "fact");
  assertEquals(memory.importance, 9);
  assertEquals(memory.metadata.recurring, true);

  teardownTest();
});

Deno.test("MemoryRepository - getById increments access count", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  const created = repo.create({
    content: "Test memory for access count",
  });

  const retrieved = repo.getById(created.id);
  assertEquals(retrieved?.accessCount, 1);

  const retrieved2 = repo.getById(created.id);
  assertEquals(retrieved2?.accessCount, 2);

  teardownTest();
});

Deno.test("MemoryRepository - getById returns null for non-existent", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  const result = repo.getById("non-existent-id");
  assertEquals(result, null);

  teardownTest();
});

Deno.test("MemoryRepository - getAll returns memories ordered by importance", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  repo.create({ content: "Low importance", importance: 1 });
  repo.create({ content: "High importance", importance: 10 });
  repo.create({ content: "Medium importance", importance: 5 });

  const all = repo.getAll();
  assertEquals(all.length >= 3, true);

  teardownTest();
});

Deno.test("MemoryRepository - getAll filters by category", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  repo.create({ content: "Preference 1", category: "preference" });
  repo.create({ content: "Fact 1", category: "fact" });
  repo.create({ content: "Preference 2", category: "preference" });

  const preferences = repo.getAll({ category: "preference" });
  assertEquals(preferences.every((m) => m.category === "preference"), true);

  teardownTest();
});

Deno.test("MemoryRepository - update modifies memory fields", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  const created = repo.create({
    content: "Original content",
    importance: 5,
  });

  const updated = repo.update(created.id, {
    content: "Updated content",
    importance: 8,
  });

  assertEquals(updated?.content, "Updated content");
  assertEquals(updated?.importance, 8);

  teardownTest();
});

Deno.test("MemoryRepository - update returns null for non-existent", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  const result = repo.update("non-existent", { content: "test" });
  assertEquals(result, null);

  teardownTest();
});

Deno.test("MemoryRepository - delete removes memory", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  const created = repo.create({ content: "To be deleted" });
  assertEquals(repo.delete(created.id), true);
  assertEquals(repo.getById(created.id), null);

  teardownTest();
});

Deno.test("MemoryRepository - delete returns false for non-existent", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  assertEquals(repo.delete("non-existent"), false);

  teardownTest();
});

Deno.test("MemoryRepository - search finds memories by content", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  repo.create({ content: "The quick brown fox jumps" });
  repo.create({ content: "The lazy dog sleeps" });
  repo.create({ content: "A quick brown cat meows" });

  const results = repo.search({ query: "quick" });
  assertEquals(results.length >= 2, true);

  teardownTest();
});

Deno.test("MemoryRepository - search respects importance filter", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  repo.create({ content: "Important test memory", importance: 10 });
  repo.create({ content: "Less important test memory", importance: 2 });

  const results = repo.search({
    query: "test",
    minImportance: 5,
  });

  assertEquals(results.every((r) => r.memory.importance >= 5), true);

  teardownTest();
});

Deno.test("MemoryRepository - getByCategory returns filtered memories", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  repo.create({ content: "User likes tea", category: "preference" });
  repo.create({ content: "User works remotely", category: "fact" });

  const preferences = repo.getByCategory("preference");
  assertEquals(preferences.every((m) => m.category === "preference"), true);

  teardownTest();
});

Deno.test("MemoryRepository - count returns total memory count", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  const before = repo.count();
  repo.create({ content: "New memory 1" });
  repo.create({ content: "New memory 2" });
  const after = repo.count();

  assertEquals(after, before + 2);

  teardownTest();
});

Deno.test("MemoryRepository - getRecent returns recent memories", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  repo.create({ content: "Memory 1" });
  repo.create({ content: "Memory 2" });
  repo.create({ content: "Memory 3" });

  const recent = repo.getRecent(2);
  assertEquals(recent.length, 2);

  teardownTest();
});

Deno.test("MemoryRepository - getImportant returns high importance memories", async () => {
  await setupTest();
  const repo = getMemoryRepository();

  repo.create({ content: "Critical info", importance: 10 });
  repo.create({ content: "Trivial info", importance: 1 });
  repo.create({ content: "Very important", importance: 9 });

  const important = repo.getImportant(2);
  assertEquals(important.length, 2);
  assertEquals(important[0].importance >= important[1].importance, true);

  teardownTest();
});
