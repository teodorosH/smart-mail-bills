/**
 * Universal Candidate Extractor
 */
function extractCandidates(cleanText) {
  if (!cleanText || typeof cleanText !== 'string') return [];

  // ניקוי תווי כיווניות מוסתרים של PDF
  const normalizedText = cleanText.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '');
  const lines = normalizedText.split('\n');
  const candidates = [];
  const totalLines = lines.length;

  const numberRegex = /\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\b|\b\d+(?:\.\d{1,2})?\b/g;

  lines.forEach((lineText, lineIndex) => {
    const digitsOnly = lineText.replace(/\D/g, '');
    if (digitsOnly.length > 25) return;

    if ((digitsOnly.startsWith('1800') || digitsOnly.startsWith('05')) && digitsOnly.length >= 9) {
      if (!lineText.includes('₪') && !lineText.includes('סה"כ') && !lineText.includes('לתשלום')) {
        return;
      }
    }

    let match;
    let lastIndex = -1;

    while ((match = numberRegex.exec(lineText)) !== null) {
      if (numberRegex.lastIndex === lastIndex) {
        numberRegex.lastIndex++;
        continue;
      }
      lastIndex = numberRegex.lastIndex;

      const rawMatch = match[0];
      const numericValue = parseFloat(rawMatch.replace(/,/g, ''));

      if (isNaN(numericValue) || numericValue <= 0) continue;

      if (!rawMatch.includes('.') && numericValue >= 2020 && numericValue <= 2030) continue;
      if (!rawMatch.includes('.') && numericValue > 100000) continue;

      const prevLine = lines[lineIndex - 1] || '';
      const nextLine = lines[lineIndex + 1] || '';
      const contextWindow = `${prevLine} ${lineText} ${nextLine}`;
      const hasCurrencySymbol = /[₪$€]|ש"?ח|USD|EUR/i.test(contextWindow);
      const isDecimal = rawMatch.includes('.') && rawMatch.split('.')[1].length === 2;

      candidates.push({
        rawText: rawMatch,
        value: numericValue,
        lineIndex,
        lineText,
        isBottomThird: lineIndex >= Math.floor(totalLines * 0.4),
        hasCurrencySymbol,
        isDecimal
      });
    }
  });

  return candidates;
}

module.exports = { extractCandidates };