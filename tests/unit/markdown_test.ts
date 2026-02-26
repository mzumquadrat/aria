import { assertEquals } from "@std/assert";
import { escapeMarkdownV2 } from "../../src/bot/messaging.ts";

Deno.test("escapeMarkdownV2 - escapes special characters", () => {
  const input = "Hello! How are you?";
  const expected = "Hello\\! How are you?"; // ? is not a special char in MarkdownV2
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - escapes dots and dashes", () => {
  const input = "Check example.com - it's great!";
  const expected = "Check example\\.com \\- it's great\\!";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - escapes all special characters", () => {
  const input = "Test: _ * [ ] ( ) ~ ` > # + - = | { } . !";
  const expected = "Test: \\_ \\* \\[ \\] \\( \\) \\~ \\` \\> \\# \\+ \\- \\= \\| \\{ \\} \\. \\!";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - preserves bold formatting", () => {
  const input = "This is *bold text* and this is not.";
  const expected = "This is *bold text* and this is not\\.";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - preserves italic formatting", () => {
  const input = "This is _italic text_ and this is not.";
  const expected = "This is _italic text_ and this is not\\.";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - preserves underline formatting", () => {
  const input = "This is __underlined text__.";
  const expected = "This is __underlined text__\\.";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - preserves strikethrough formatting", () => {
  const input = "This is ~strikethrough text~.";
  const expected = "This is ~strikethrough text~\\.";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - preserves inline code", () => {
  const input = "Use the `console.log()` function.";
  const expected = "Use the `console.log()` function\\.";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - preserves code block", () => {
  const input = "Example:\n```\ncode here\n```\nEnd.";
  const expected = "Example:\n```\ncode here\n```\nEnd\\.";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - preserves links", () => {
  const input = "Check [this link](https://example.com)!";
  const expected = "Check [this link](https://example.com)\\!";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - removes existing escapes first", () => {
  // If LLM already escaped some characters, we should handle it
  const input = "Hello\\! Check example\\.com";
  const expected = "Hello\\! Check example\\.com";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - handles mixed formatting and special chars", () => {
  const input = "Hello! Visit *example.com* - it's great!";
  const expected = "Hello\\! Visit *example.com* \\- it's great\\!";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - handles German text with special chars", () => {
  const input = "Perfekt! Ich habe den Termin aktualisiert.";
  const expected = "Perfekt\\! Ich habe den Termin aktualisiert\\.";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - handles time ranges", () => {
  const input = "Zeit: 14:00 - 16:00 Uhr (2 Stunden)";
  const expected = "Zeit: 14:00 \\- 16:00 Uhr \\(2 Stunden\\)";
  assertEquals(escapeMarkdownV2(input), expected);
});

Deno.test("escapeMarkdownV2 - handles complex message", () => {
  const input = `Perfekt! Ich habe den Termin aktualisiert 📅

*Neuer Plan:*
• *Zeit:* 14:00 - 16:00 Uhr (2 Stunden)
• *Ort:* Coffee Bay, Marktplatz 9, 35390 Gießen

2 Stunden sollten auf jeden Fall reichen! ☕😊`;
  
  const result = escapeMarkdownV2(input);
  
  // Check that special characters are escaped
  assertEquals(result.includes("\\!"), true);
  assertEquals(result.includes("\\-"), true);
  assertEquals(result.includes("\\:"), false); // : is not a special char
  
  // Check that formatting is preserved (bold uses *text* in MarkdownV2)
  assertEquals(result.includes("*Neuer Plan:*"), true);
  assertEquals(result.includes("*Zeit:*"), true);
  assertEquals(result.includes("*Ort:*"), true);
});

Deno.test("escapeMarkdownV2 - empty string", () => {
  assertEquals(escapeMarkdownV2(""), "");
});

Deno.test("escapeMarkdownV2 - no special characters", () => {
  const input = "Just normal text without special chars";
  assertEquals(escapeMarkdownV2(input), input);
});
