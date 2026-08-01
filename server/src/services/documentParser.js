const extractAmount = (text) => {

  const patterns = [
    /(?:total|amount due|balance due|grand total|amount)\s*[:\-]?\s*[$€£]?\s*([\d,]+\.\d{2})/i,
    /[$€£]\s*([\d,]+\.\d{2})/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return parseFloat(
        match[1].replace(',', '')
      );
    }
  }

  return null;
};


const extractCurrency = (text) => {

  if (text.includes('$') || /USD/i.test(text)) {
    return 'USD';
  }

  if (text.includes('€') || /EUR/i.test(text)) {
    return 'EUR';
  }

  if (text.includes('₪') || /ILS|NIS/i.test(text)) {
    return 'ILS';
  }

  return null;
};


const detectDocumentType = (text) => {

  const lower = text.toLowerCase();

  if (
    lower.includes('invoice') ||
    lower.includes('tax invoice') ||
    lower.includes('חשבונית')
  ) {
    return 'invoice';
  }


  if (
    lower.includes('receipt') ||
    lower.includes('קבלה')
  ) {
    return 'receipt';
  }


  if (
    lower.includes('amount due') ||
    lower.includes('payment required') ||
    lower.includes('please pay')
  ) {
    return 'payment_request';
  }


  return 'other';
};


const extractDates = (text) => {

  const dates = text.match(
    /\b\d{4}[-\/]\d{2}[-\/]\d{2}\b/g
  );


  return {
    invoiceDate: dates?.[0] || null,
    dueDate: dates?.[1] || null
  };
};


const extractCompany = (text) => {

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);


  // בדרך כלל שם החברה נמצא בתחילת המסמך
  return lines[0] || null;
};


const parseDocument = (text) => {

  const amount = extractAmount(text);
  const currency = extractCurrency(text);
  const documentType = detectDocumentType(text);
  const dates = extractDates(text);
  const company = extractCompany(text);


  let confidence = 0;


  if(company)
    confidence += 0.25;

  if(amount)
    confidence += 0.35;

  if(documentType !== 'other')
    confidence += 0.25;

  if(dates.invoiceDate)
    confidence += 0.15;


  return {
    company,
    amount,
    currency,
    documentType,
    paymentRequired:
      documentType === 'payment_request',

    ...dates,

    confidence
  };
};


module.exports = {
  parseDocument
};