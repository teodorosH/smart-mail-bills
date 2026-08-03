const { parseAmount } = require('./parser/amountParser');
const { extractCurrency } = require('./parser/currencyParser');

function resolveDocType(text) {
  if (!text || typeof text !== 'string') return 'other';

  const lower = text.toLowerCase();
  if (lower.includes('קבלה') || lower.includes('receipt') || lower.includes('שולם')) return 'receipt';
  if (lower.includes('חשבונית') || lower.includes('invoice') || lower.includes('חיוב')) return 'invoice';
  if (lower.includes('לתשלום עד') || lower.includes('לתשלום:') || lower.includes('payment due')) return 'payment_request';

  return 'other';
}

function extractDates(text) {
  if (!text) return { invoiceDate: null, dueDate: null };
  const dateRegex = /\b(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}|\d{4}[-\/]\d{2}[-\/]\d{2})\b/g;
  const matches = [...text.matchAll(dateRegex)].map(m => m[0]);
  const validDates = matches.filter(d => !d.startsWith('1800') && !d.startsWith('05'));

  return {
    invoiceDate: validDates[0] || null,
    dueDate: validDates[1] || null
  };
}

function extractCompany(text) {
  if (!text || typeof text !== 'string') return null;

  // מילון תבניות ספקים מובילים
  const VENDOR_PATTERNS = [
    { pattern: /anthropic/i, name: 'Anthropic, PBC' },
    { pattern: /חברת\s*החשמל/i, name: 'חברת החשמל לישראל בע"מ' },
    { pattern: /פז\s*קמעונאות|פז/i, name: 'פז קמעונאות ואנרגיה בע"מ' },
    { pattern: /סיטי\s*וואש|city\s*wash|שטיפה/i, name: 'סיטי וואש אקספרס' },
    { pattern: /הבאר\s*השלישית|habeer/i, name: 'הבאר השלישית בע"מ' },
    { pattern: /ג'יטייס|גטיס|gts|גיטייסקאטגס/i, name: `ג'יטייס קאטגס מערכות בע"מ` }
  ];

  for (const v of VENDOR_PATTERNS) {
    if (v.pattern.test(text)) return v.name;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const prefixCleaner = /^(בנק הדואר|יתקבלו לפקודת|לכבוד|ספק|שם העסק|חברה|עבור|שם הלקוח)[:\s]*/i;
  const corporateRegex = /([\u0590-\u05FFa-zA-Z0-9\s'".&–-]+(?:בע"מ|בעמ|Ltd|LTD|Inc|LLC|בע״מ))/i;

  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const match = lines[i].match(corporateRegex);
    if (match && match[1]) {
      let cleanName = match[1].replace(prefixCleaner, '').trim();
      cleanName = cleanName.replace(/.*יתקבלו לפקודת\s*/i, '').trim();
      if (cleanName.length >= 3 && cleanName.length <= 50) return cleanName;
    }
  }

  const ignoreList = /^(page|invoice|receipt|tax|חשבונית|קבלה|מסמך|מקור|עמוד|בס"ד|תאריך|לכבוד|סכום|טלפון|פקס)/i;
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i];
    if (!ignoreList.test(line) && line.length >= 3 && line.length <= 45) {
      if (!/^[\d\s\.\/\-:\\]+$/.test(line)) {
        return line.replace(prefixCleaner, '').trim();
      }
    }
  }

  return null;
}

function parseDocument(cleanText) {
  console.log('🔥🔥🔥 EXECUTING UPDATED PARSE DOCUMENT 🔥🔥🔥');

  if (!cleanText || typeof cleanText !== 'string') {
    return {
      companyName: null,
      invoiceNumber: null,
      amount: null,
      currency: 'ILS',
      invoiceDate: null,
      dueDate: null,
      documentType: 'other',
      paymentRequired: false,
      category: 'Other',
      summary: 'מסמך ריק',
      confidence: 0
    };
  }

  // 1. איחוד ספרות מופרדות ברווחים (סיטי וואש "9 9" -> "99")
  const normalizedForAmount = cleanText.replace(/(\d)\s+(\d)/g, '$1$2');

  // 2. עדיפות עליונה לסכום דולרי סופי (Anthropic / Stripe Total)
  let safeAmount = null;
  const usdTotals = [];
  const usdRegex = /(?:total|amount\s*due|grand\s*total|subtotal)\s*[:\=-]?\s*\$?\s*([\d,]+\.\d{2})|\$\s*([\d,]+\.\d{2})\s*(?:due|total|usd)/gi;
  let dMatch;

  while ((dMatch = usdRegex.exec(normalizedForAmount)) !== null) {
    const valStr = dMatch[1] || dMatch[2];
    if (valStr) {
      const val = parseFloat(valStr.replace(/,/g, ''));
      if (val > 0 && val < 1000000) usdTotals.push(val);
    }
  }

  if (usdTotals.length > 0) {
    safeAmount = Math.max(...usdTotals);
  }

  // 3. עדיפות שנייה: סכום בשורת סה"כ בעברית (סיטי וואש 99.00 / פז / חברת החשמל)
  if (!safeAmount) {
    const hebrewMatch = normalizedForAmount.match(/(?:סה"כ\s*לתשלום|סה״כ\s*לתשלום|סך\s*הכל\s*לתשלום|סה"כ\s*חיוב|סכום\s*כולל|סה"כ|סך\s*הכל)\s*[:\=-]?\s*[$₪€]?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                        normalizedForAmount.match(/([\d,]+(?:\.\d{1,2})?)\s*[$₪€]?\s*(?:סה"כ|סה״כ|סך\s*הכל)/i);

    if (hebrewMatch && hebrewMatch[1]) {
      const val = parseFloat(hebrewMatch[1].replace(/,/g, ''));
      if (val > 0) safeAmount = val;
    }
  }

  // 4. Fallback ל-parseAmount הקיים
  if (!safeAmount) {
    const amountRes = parseAmount(normalizedForAmount);
    if (typeof amountRes === 'number' && !isNaN(amountRes) && amountRes > 0) {
      safeAmount = amountRes;
    } else if (amountRes && typeof amountRes.amount === 'number' && !isNaN(amountRes.amount) && amountRes.amount > 0) {
      safeAmount = amountRes.amount;
    }
  }

  // 5. חסימת מספרי מזהה גדולים ללא נקודה עשרונית (מונע לכידת 4629 בג'יטייס)
  if (safeAmount && safeAmount > 500 && !String(safeAmount).includes('.')) {
    safeAmount = null;
  }

  // Metadata Extraction
  const currency = typeof extractCurrency === 'function' ? extractCurrency(cleanText, safeAmount) : 'ILS';
  const documentType = resolveDocType(cleanText);
  const dates = extractDates(cleanText);
  const company = extractCompany(cleanText);

  // Summary Formatting
  const docTypeStr = typeof documentType === 'string' ? documentType.toUpperCase() : 'DOCUMENT';
  const summaryText = `${docTypeStr} - ${company || 'Unknown Supplier'} - ${safeAmount !== null ? safeAmount + ' ' + currency : 'No Amount'}`;

  return {
    companyName: company,
    invoiceNumber: null,
    amount: safeAmount,
    currency: currency || 'ILS',
    invoiceDate: dates.invoiceDate,
    dueDate: dates.dueDate,
    documentType: documentType || 'other',
    paymentRequired: documentType === 'payment_request',
    category: 'Other',
    summary: String(summaryText),
    confidence: safeAmount !== null ? 0.85 : 0.65
  };
}

module.exports = { parseDocument };