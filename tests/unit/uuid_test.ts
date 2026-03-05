import { assertEquals } from "@std/assert";
import { generateUUIDv4 } from "../../src/storage/uuid.ts";

Deno.test("generateUUIDv4 returns a valid UUID", () => {
  const uuid = generateUUIDv4();

  assertEquals(typeof uuid, "string");
  assertEquals(uuid.length, 36);

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assertEquals(uuidRegex.test(uuid), true);
});

Deno.test("generateUUIDv4 returns unique values", () => {
  const uuids = new Set<string>();

  for (let i = 0; i < 1000; i++) {
    uuids.add(generateUUIDv4());
  }

  assertEquals(uuids.size, 1000);
});
