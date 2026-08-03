// מיפוי מונחים לפי שפת משתמש (תומך בעברית כברירת מחדל ואנגלית)
export const translations = {
  he: {
    columns: {
      company: 'שם חברה / מסמך',
      amount: 'סכום לתשלום',
      date: 'תאריך',
      type: 'סוג מסמך',
      status: 'סטטוס'
    },
    docTypes: {
      invoice: 'חשבונית מס',
      receipt: 'קבלה',
      reminder: 'תזכורת חוב',
      other: 'אחר'
    },
    currencies: {
      ILS: '₪',
      USD: '$',
      EUR: '€'
    }
  },
  en: {
    columns: {
      company: 'Company / File',
      amount: 'Amount',
      date: 'Date',
      type: 'Document Type',
      status: 'Status'
    },
    docTypes: {
      invoice: 'Invoice',
      receipt: 'Receipt',
      reminder: 'Payment Reminder',
      other: 'Other'
    },
    currencies: {
      ILS: 'ILS',
      USD: 'USD',
      EUR: 'EUR'
    }
  }
};

/**
 * פונקציית עזר להמרת סוג המסמך והצגתו בשפת המשתמש
 */
export const formatDocType = (type, lang = 'he') => {
  const dict = translations[lang] || translations.he;
  return dict.docTypes[type?.toLowerCase()] || type || dict.docTypes.other;
};

/**
 * פונקציית עזר להצגת סכום ומטבע
 */
export const formatAmount = (amount, currency, lang = 'he') => {
  if (!amount && amount !== 0) return '-';
  const dict = translations[lang] || translations.he;
  const symbol = dict.currencies[currency] || currency || '₪';
  return `${Number(amount).toLocaleString()} ${symbol}`;
};