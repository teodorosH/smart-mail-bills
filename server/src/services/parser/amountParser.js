/**
 * Standalone Precision Amount Parser V10
 */
function parseAmount(cleanText) {
  try {
    if (!cleanText || typeof cleanText !== 'string') {
      return { amount: null, confidence: 0 };
    }

    // 1. חיפוש ישיר של "סה"כ לתשלום" (מבטיח חילוץ 162.11 ב"הבאר השלישית" ו-99.00 ב"סיטי וואש")
    const directTotalMatch = cleanText.match(/(?:סה"כ\s*לתשלום|סך\s*הכל\s*לתשלום|לתשלום\s*ב-?₪?|סה״כ\s*לתשלום)\s*[:\=-]?\s*([\d,]+\.\d{2})/i);
    if (directTotalMatch && directTotalMatch[1]) {
      const parsedVal = parseFloat(directTotalMatch[1].replace(/,/g, ''));
      if (parsedVal > 0 && parsedVal < 50000) {
        return { amount: parsedVal, confidence: 0.99 };
      }
    }

    const lines = cleanText.split('\n');
    const candidates = [];
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
      while ((match = numberRegex.exec(lineText)) !== null) {
        const rawMatch = match[0];
        const val = parseFloat(rawMatch.replace(/,/g, ''));

        if (isNaN(val) || val <= 0) continue;
        if (!rawMatch.includes('.') && val >= 2010 && val <= 2030) continue;
        if (!rawMatch.includes('.') && val > 100000) continue;

        // סינון תאריכים במבנה DD.MM
        if (rawMatch.includes('.')) {
          const parts = rawMatch.split('.');
          const num1 = parseInt(parts[0], 10);
          const num2 = parseInt(parts[1], 10);

          if (num1 >= 1 && num1 <= 31 && num2 >= 1 && num2 <= 12) {
            if (/תאריך|הדפסה|תקופה|עד|מיום|עברי|202\d|דפוס/i.test(lineText)) {
              continue;
            }
          }
        }

        const lowerLine = lineText.toLowerCase();
        const prevLine = lineIndex > 0 ? lines[lineIndex - 1].toLowerCase() : '';
        const nextLine = lineIndex < lines.length - 1 ? lines[lineIndex + 1].toLowerCase() : '';

        let score = 20;

        // קנס כבד לצריכה/מ"ק (מבטל את 16.77 m³)
        if (/מ"ק|מק|m3|צריכה|קריאה|הפרשי מדידה|תעריף/i.test(lowerLine) && !lowerLine.includes('₪') && !lowerLine.includes('ש"ח')) {
          score -= 200;
        }

        // קנס לשורות לפני מע"מ (מבטל את 83.90 מול 99.00)
        if (/לפני מע"מ|לפני מע״מ|ללא מע"מ|ללא מע״מ|סכום ביניים|subtotal|before vat/i.test(lowerLine)) {
          score -= 100;
        }

        // בונוס לסכום סופי לתשלום
        if (
          /כולל מע"מ|כולל מע״מ|סה"כ לתשלום|סה״כ לתשלום|סך הכל לתשלום|סכום כולל|total due|amount due|grand total|לתשלום ב-₪/i.test(lowerLine) ||
          /כולל מע"מ|סה"כ לתשלום|סה״כ לתשלום|סך הכל לתשלום/i.test(prevLine) ||
          /כולל מע"מ|סה"כ לתשלום|סה״כ לתשלום|סך הכל לתשלום/i.test(nextLine)
        ) {
          score += 200;
        } else if (/סה"כ|סה״כ|סך הכל|total|amount|סכום/i.test(lowerLine)) {
          score += 40;
        }

        if (rawMatch.includes('.') && rawMatch.split('.')[1].length === 2) {
          score += 20;
        }
        if (/[₪$€]|ש"?ח|USD|EUR/i.test(lineText)) {
          score += 40;
        }

        candidates.push({ value: val, score });
      }
    });

    if (candidates.length === 0) {
      return { amount: null, confidence: 0 };
    }

    candidates.sort((a, b) => b.score - a.score);
    return {
      amount: candidates[0].value,
      confidence: 0.90
    };
  } catch (err) {
    console.error('Error in parseAmount:', err);
    return { amount: null, confidence: 0 };
  }
}

module.exports = { parseAmount };