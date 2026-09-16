import * as cheerio from "cheerio";
import { sha256 } from "../utils/hash.js";

export interface CleanedDocument {
  url: string;
  title: string;
  text: string;
  contentHash: string;
  charCount: number;
}

const DEFAULT_MAX_CHARS = 25000;

/**
 * Strips scripts, styles, tracking, navigation, ads, and extracts structured text.
 */
export function cleanHtmlDocument(
  html: string,
  url: string,
  maxChars = DEFAULT_MAX_CHARS
): CleanedDocument {
  if (!html) {
    return {
      url,
      title: "",
      text: "",
      contentHash: sha256(""),
      charCount: 0,
    };
  }

  const $ = cheerio.load(html);

  // Remove non-content elements
  $(
    "script, style, noscript, iframe, svg, canvas, nav, footer, form, button, " +
      ".nav, .navbar, .footer, .ad, .ads, .cookie-banner, .modal, [aria-hidden='true']"
  ).remove();

  // Extract page title
  const title = (
    $("title").first().text() ||
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text() ||
    ""
  ).trim();

  // Extract structured body text
  // Insert newlines around block tags so words don't merge together
  $("h1, h2, h3, h4, h5, h6, p, li, blockquote, tr, td, th").each((_, el) => {
    $(el).prepend("\n").append("\n");
  });

  const rawText = $("body").length ? $("body").text() : $.text();

  // Clean and normalize whitespace
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let cleanText = lines.join("\n");

  // Truncate if exceeds safe token/character budget
  if (cleanText.length > maxChars) {
    cleanText = cleanText.substring(0, maxChars) + "\n...[content truncated]";
  }

  return {
    url,
    title,
    text: cleanText,
    contentHash: sha256(cleanText),
    charCount: cleanText.length,
  };
}
