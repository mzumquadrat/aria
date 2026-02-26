const MARKDOWNV2_SPECIAL_CHARS = /[_*[\]()~`>#+\-=|{}.!]/g;
const MARKDOWNV2_CODE_BLOCK_CHARS = /[`\\]/g;

export function escapeMarkdownV2(text: string): string {
  return text.replace(MARKDOWNV2_SPECIAL_CHARS, "\\$&");
}

export function escapeMarkdownV2CodeBlock(text: string): string {
  return text.replace(MARKDOWNV2_CODE_BLOCK_CHARS, "\\$&");
}
