const currencyPatterns = [
  {
    currency: 'ILS',
    patterns: [/₪/, /\bILS\b/i, /\bNIS\b/i, /ש"?ח/i, /שקל/i]
  },
  {
    currency: 'USD',
    patterns: [/\$/, /\bUSD\b/i, /דולר/i]
  },
  {
    currency: 'EUR',
    patterns: [/€/, /\bEUR\b/i, /אירו/i]
  },
  {
    currency: 'GBP',
    patterns: [/£/, /\bGBP\b/i, /פאונד/i]
  }
];

function extractCurrency(text, amount = null) {
  if (!text) return 'ILS'; // Default fallback for Israeli context

  // 1. Contextual match near the selected amount (50 chars window)
  if (amount !== null && typeof amount === 'number') {
    const formattedAmount = amount.toString();
    const escapedAmount = formattedAmount.replace('.', '\\.');

    // Look for text within 25 chars before or after the amount
    const contextRegex = new RegExp(
      `.{0,25}${escapedAmount}.{0,25}`,
      'gi'
    );

    const match = text.match(contextRegex);
    if (match) {
      const windowText = match.join(' ');
      for (const currObj of currencyPatterns) {
        if (currObj.patterns.some((p) => p.test(windowText))) {
          return currObj.currency;
        }
      }
    }
  }

  // 2. Global Document Fallback
  for (const currObj of currencyPatterns) {
    if (currObj.patterns.some((p) => p.test(text))) {
      return currObj.currency;
    }
  }

  return 'ILS';
}

module.exports = { extractCurrency };