/**
 * 🟢 amountParser מיושר
 */
function parseAmount(text) {
  if (!text || typeof text !== 'string') return null;

  const normalizedText = text.replace(/(\d)\s+(\d)/g, '$1$2');
  const lines = normalizedText.split('\n');

  const candidates = [];
  const numberRegex = /\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\b|\b\d+(?:\.\d{1,2})?\b/g;

  lines.forEach((lineText, lineIndex) => {
    let numMatch;
    while ((numMatch = numberRegex.exec(lineText)) !== null) {
      const rawMatch = numMatch[0];
      const val = parseFloat(rawMatch.replace(/,/g, ''));

      if (isNaN(val) || val <= 0) continue;

      // חסימת מספרי מזהה/מספרי חשבונית גדולים ללא נקודה עשרונית (מונע 4629)
      if (!rawMatch.includes('.') && val > 500) continue;
      if (!rawMatch.includes('.') && val >= 1990 && val <= 2030) continue;

      const lowerLine = lineText.toLowerCase();
      let score = 10;

      if (/qty|unit\s*price|quantity|qty\/unit|מע"מ|vat|subtotal|לפני|pmb|box|street|date|תאריך|ח\.פ|ע\.מ|מספר|חשבונית/i.test(lowerLine)) {
        score -= 1000;
      }

      if (/total|due|לתשלום|סה"כ|סך\s*הכל|חיוב|שולם/i.test(lowerLine)) {
        score += 500;
      }

      if (rawMatch.includes('.') && rawMatch.split('.')[1].length === 2) {
        score += 100;
      }

      if (/[₪$€]|ש"?ח|USD|EUR/i.test(lineText)) {
        score += 150;
      }

      score += (lineIndex / lines.length) * 50;

      candidates.push({ value: val, score });
    }
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  return candidates[0].value;
}

module.exports = { parseAmount };