/**
 * OCR Cleaner & Text Normalizer for Hebrew/English Invoices
 */

/**
 * Normalizes Hebrew character spacing (e.g., "ס ה " כ" -> "סה"כ")
 */
function fixHebrewKerning(text) {
  // Rejoins single Hebrew characters separated by space when they form known keywords
  return text
    // "ס ה " כ" or "ס ה ״ כ" -> "סה"כ"
    .replace(/\bס\s+ה\s*["״']\s*כ\b/g, 'סה"כ')
    // "ל ת ש ל ו ם" -> "לתשלום"
    .replace(/\bל\s+ת\s+ש\s+ל\s+ו\s+ם\b/g, 'לתשלום')
    // "ח ש ב ו נ י ת" -> "חשבונית"
    .replace(/\bח\s+ש\s+ב\s+ו\s+נ\s+י\s+ת\b/g, 'חשבונית')
    // "ק ב ל ה" -> "קבלה"
    .replace(/\bק\b\s+\bב\b\s+\bל\b\s+\bה\b/g, 'קבלה')
    // "מ ס פ ר" -> "מספר"
    .replace(/\bמ\s+ס\s+פ\s+ר\b/g, 'מספר');
}

/**
 * Standardizes quotes, dashes, and currency spaces
 */
function normalizeCharacters(text) {
  return text
    // Convert diverse quotes/apostrophes to standard ones
    .replace(/[״""'']/g, '"')
    // Normalize dashes
    .replace(/[–—−]/g, '-')
    // Normalize currency spacing: "₪ 162.11" or "162.11 ₪" -> "₪162.11" / "162.11₪"
    .replace(/₪\s+([\d,.]+)/g, '₪$1')
    .replace(/([\d,.]+)\s+₪/g, '$1₪')
    .replace(/\$\s+([\d,.]+)/g, '$$$1')
    .replace(/USD\s+([\d,.]+)/gi, 'USD $1')
    .replace(/ש"?ח\s+([\d,.]+)/g, 'ש"ח $1');
}

/**
 * Cleans raw OCR text into a structured, parse-ready string.
 * @param {string} rawText - The raw output from OCR or PDF parser
 * @returns {string} cleanText
 */
function cleanOcrText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  // 1. Split into lines to preserve spatial context
  const lines = rawText.split(/\r?\n/);

  const cleanedLines = lines.map((line) => {
    let cleaned = line;

    // Fix broken Hebrew spaces
    cleaned = fixHebrewKerning(cleaned);

    // Normalize special characters & quotes
    cleaned = normalizeCharacters(cleaned);

    // Remove control characters & replace multiple horizontal spaces with a single space
    cleaned = cleaned.replace(/[\t\f\v]/g, ' ').replace(/ {2,}/g, ' ').trim();

    return cleaned;
  });

  // Filter out completely empty lines while maintaining structured layout
  return cleanedLines.filter((line) => line.length > 0).join('\n');
}

module.exports = {
  cleanOcrText,
  fixHebrewKerning,
  normalizeCharacters,
};