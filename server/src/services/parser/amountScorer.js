/**
 * Scoring Engine with Precision Biases
 */
const HIGH_KEYWORDS = [
  'סה"כ לתשלום',
  'סה״כ לתשלום',
  'סה"כ כולל מע"מ',
  'סה״כ כולל מע״מ',
  'סך הכל לתשלום',
  'total due',
  'amount due',
  'grand total',
  'סכום לתשלום',
  'לתשלום'
];

const MEDIUM_KEYWORDS = [
  'סה"כ',
  'סה״כ',
  'סך הכל',
  'total',
  'amount',
  'סכום'
];

function scoreCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];

  return candidates.map((candidate) => {
    let score = 20; // ניקוד בסיס חיובי מבטיח החזרת מועמד
    const lowerLine = candidate.lineText.toLowerCase();

    if (HIGH_KEYWORDS.some((kw) => lowerLine.includes(kw))) {
      score += 50;
    } else if (MEDIUM_KEYWORDS.some((kw) => lowerLine.includes(kw))) {
      score += 25;
    }

    // בונוס לסכום עשרוני מלא (162.11 מול 62)
    if (candidate.isDecimal) {
      score += 40;
    }

    if (candidate.hasCurrencySymbol) {
      score += 15;
    }

    if (candidate.isBottomThird) {
      score += 10;
    }

    return {
      ...candidate,
      score
    };
  });
}

module.exports = { scoreCandidates };