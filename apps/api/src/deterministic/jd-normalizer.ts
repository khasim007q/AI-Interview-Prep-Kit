export interface NormalizedJd {
  text: string;
  charCount: number;
  wordCount: number;
}

/**
 * Deterministically normalizes a job description.
 * - Trims external whitespace
 * - Normalizes unicode characters
 * - Normalizes line breaks (\r\n -> \n)
 * - Collapses 3+ consecutive newlines to 2
 * - Strips zero-width and invisible control characters
 */
export function normalizeJobDescription(rawJd: string): NormalizedJd {
  if (!rawJd || typeof rawJd !== "string") {
    return {
      text: "",
      charCount: 0,
      wordCount: 0,
    };
  }

  // Normalize line endings
  let text = rawJd.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Remove zero-width characters and invisible control codes (except \n, \t)
  text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // Normalize Unicode
  text = text.normalize("NFKC");

  // Trim trailing whitespace per line
  text = text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // Collapse 3+ newlines to 2 (paragraph break)
  text = text.replace(/\n{3,}/g, "\n\n");

  // Final trim
  text = text.trim();

  const words = text ? text.split(/\s+/).filter(Boolean) : [];

  return {
    text,
    charCount: text.length,
    wordCount: words.length,
  };
}
