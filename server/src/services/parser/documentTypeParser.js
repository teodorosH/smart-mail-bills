const { parseAmount } = require('./amountParser');
const { extractCurrency } = require('./currencyParser');
const { detectDocumentType } = require('./documentTypeParser');

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
  if (!text) return null;
  const ignoreRegex = /^(page|invoice|receipt|tax|חשבונית|קבלה|מסמך|מקור|עמוד|בס"ד)/i;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (!ignoreRegex.test(line) && line.length > 2 && line.length < 50) {
      if (!/^[\d\s\.\/\-]+$/.test(line)) {
        return line;
      }
    }
  }
  return null;
}

function parseDocument(cleanText) {
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

  // 1. Amount Extraction & Scoring
  const amountResult = parseAmount(cleanText);
  const rawAmount = (typeof amountResult === 'object' && amountResult !== null) ? amountResult.amount : amountResult;
  const safeAmount = (typeof rawAmount === 'number' && !isNaN(rawAmount)) ? rawAmount : null;
  const amountConfidence = amountResult?.confidence || 0.5;

  // 2. Bound Currency Parsing
  const currency = extractCurrency(cleanText, safeAmount);

  // 3. Document Classification
  const documentType = detectDocumentType(cleanText);

  // 4. Dates & Company
  const dates = extractDates(cleanText);
  const company = extractCompany(cleanText);

  // 5. Summary String Formatting
  const summaryText = `${documentType.toUpperCase()} - ${company || 'Unknown Supplier'} - ${safeAmount !== null ? safeAmount + ' ' + currency : 'No Amount'}`;

  return {
    companyName: company,
    invoiceNumber: null, // Guard against 'Invoice' literal strings
    amount: safeAmount,
    currency,
    invoiceDate: dates.invoiceDate,
    dueDate: dates.dueDate,
    documentType,
    paymentRequired: documentType === 'payment_request',
    category: 'Other',
    summary: String(summaryText),
    confidence: Math.min(1.0, parseFloat((0.4 + amountConfidence * 0.5).toFixed(2)))
  };
}

module.exports = { detectDocumentType };