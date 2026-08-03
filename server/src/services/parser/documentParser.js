const { parseAmount } = require('./parser/amountParser');
const { extractCurrency } = require('./parser/currencyParser');
const docTypeModule = require('./parser/documentTypeParser');

function resolveDocType(text) {
  if (!text) return 'other';
  try {
    if (typeof docTypeModule === 'function') return docTypeModule(text);
    if (docTypeModule?.detectDocumentType) return docTypeModule.detectDocumentType(text);
  } catch (e) {}

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

  // 1. Amount Extraction - חילוץ שטוח וחסין
  const amountRes = parseAmount(cleanText);
  let safeAmount = null;

  if (typeof amountRes === 'number' && !isNaN(amountRes) && amountRes > 0) {
    safeAmount = amountRes;
  } else if (amountRes && typeof amountRes.amount === 'number' && !isNaN(amountRes.amount) && amountRes.amount > 0) {
    safeAmount = amountRes.amount;
  }

  // 2. Metadata Extraction
  const currency = typeof extractCurrency === 'function' ? extractCurrency(cleanText, safeAmount) : 'ILS';
  const documentType = resolveDocType(cleanText);
  const dates = extractDates(cleanText);
  const company = extractCompany(cleanText);

  // 3. Summary Formatting
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