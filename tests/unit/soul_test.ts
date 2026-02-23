import { assertEquals } from "@std/assert";
import { 
  loadSoul, 
  getCachedSoul, 
  reloadSoul,
  extractSection,
  getPersonalityTraits,
  getValues,
  formatSoulForPrompt
} from "../../src/soul/mod.ts";
import { join } from "@std/path";

const SOUL_PATH = join(Deno.cwd(), "soul.md");

Deno.test("loadSoul - loads soul.md from default path", async () => {
  const soul = await loadSoul(SOUL_PATH);
  
  assertEquals(typeof soul.content, "string");
  assertEquals(soul.content.length > 0, true);
  assertEquals(soul.path, SOUL_PATH);
  assertEquals(soul.lastLoaded instanceof Date, true);
});

Deno.test("loadSoul - caches the loaded soul", async () => {
  await loadSoul(SOUL_PATH);
  const cached = getCachedSoul();
  
  assertEquals(cached !== null, true);
  assertEquals(cached?.path, SOUL_PATH);
});

Deno.test("reloadSoul - clears cache and reloads", async () => {
  await loadSoul(SOUL_PATH);
  const first = getCachedSoul();
  
  await reloadSoul(SOUL_PATH);
  const second = getCachedSoul();
  
  assertEquals(second !== null, true);
  if (first && second) {
    assertEquals(second.lastLoaded.getTime() >= first.lastLoaded.getTime(), true);
  }
});

Deno.test("extractSection - extracts section content", async () => {
  const soul = await loadSoul(SOUL_PATH);
  
  const whoIAm = extractSection(soul.content, "Who I Am");
  assertEquals(typeof whoIAm, "string");
  if (whoIAm) {
    assertEquals(whoIAm.includes("Aria"), true);
  }
});

Deno.test("extractSection - returns null for non-existent section", async () => {
  const soul = await loadSoul(SOUL_PATH);
  
  const result = extractSection(soul.content, "Non Existent Section");
  assertEquals(result, null);
});

Deno.test("getPersonalityTraits - extracts traits", async () => {
  const soul = await loadSoul(SOUL_PATH);
  
  const traits = getPersonalityTraits(soul.content);
  assertEquals(Array.isArray(traits), true);
  assertEquals(traits.includes("Playful"), true);
  assertEquals(traits.includes("Helpful"), true);
  assertEquals(traits.includes("Flirty"), true);
});

Deno.test("getValues - extracts values", async () => {
  const soul = await loadSoul(SOUL_PATH);
  
  const values = getValues(soul.content);
  assertEquals(Array.isArray(values), true);
  assertEquals(values.length > 0, true);
});

Deno.test("formatSoulForPrompt - wraps content in tags", async () => {
  const soul = await loadSoul(SOUL_PATH);
  
  const formatted = formatSoulForPrompt(soul.content);
  assertEquals(formatted.startsWith("<soul_document>"), true);
  assertEquals(formatted.endsWith("</soul_document>"), true);
});
