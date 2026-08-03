const pool = require('../config/db');
const { extractTextFromPdf, extractPagesFromPdf } = require('../services/pdfService');
const { parseDocument } = require('../services/documentParser');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const { cleanText } = require('../utils/cleanText');

const IGNORED_COMPANY_NAMES = [
  'page 1 of 1',
  'מסמך ממוחשב',
  'לכבוד:',
  'חשבונית מס',
  'קבלה',
  'page',
  'original'
];

const getDocuments = async (req, res) => {
  try {
    const userId = req.user.userId;

    // שליפת שפת המשתמש מתוך המסד בתוך ה-Controller
    const userResult = await pool.query('SELECT language FROM users WHERE id = $1', [userId]);
    const userLanguage = userResult.rows[0]?.language || 'he';

    const { rows } = await pool.query(
      `
      SELECT
        id,
        title,
        company_name,
        amount,
        currency,
        document_type,
        payment_status,
        payment_required,
        invoice_date,
        due_date,
        summary,
        created_at
      FROM documents
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    res.json({
      success: true,
      userLanguage,
      documents: rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed loading documents'
    });
  }
};

function normalizeDate(value) {
  if (!value) return null;

  const match = value.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!match) return null;

  let day = match[1];
  let month = match[2];
  let year = match[3];

  if (year.length === 2) {
    year = '20' + year;
  }

  if (Number(month) > 12) {
    return null;
  }

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

// 🟢 מילון תבניות ספקים נפוצים (Vendor Matching Dictionary)
const VENDOR_RULES = [
  { pattern: /anthropic/i, name: 'Anthropic, PBC' },
  { pattern: /חברת\s*החשמל/i, name: 'חברת החשמל לישראל בע"מ' },
  { pattern: /פז\s*קמעונאות|פז/i, name: 'פז קמעונאות ואנרגיה בע"מ' },
  { pattern: /סיטי\s*וואש|city\s*wash|שטיפה/i, name: 'סיטי וואש אקספרס' },
  { pattern: /הבאר\s*השלישית|habeer/i, name: 'הבאר השלישית בע"מ' },
  { pattern: /ג'יטייס|גטיס|gts|גיטייסקאטגס/i, name: 'ג\'יטייס קאטגס מערכות בע"מ' }
];

const SYSTEM_STOP_WORDS = [
  'page', 'original', 'חשבונית', 'קבלה', 'מסמך', 'ממוחשב', 
  'תאריך', 'מקור', 'העתק', 'invoice', 'receipt', 'statement',
  'date', 'issue', 'due', 'street', 'p.o.', 'box', 'address', 'suite',
  'bill to', 'billed to', 'customer', 'client', 'לכבוד', 'שם הלקוח'
];

/**
 * 🟢 ניקוי פורמט שם חברה
 */
function cleanCompanyNameFormatting(name) {
  if (!name) return null;
  return name
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[@\(\)\-\_\«\»\"\'\~\s\d]+|[@\(\)\-\_\«\»\"\'\~\s\d]+$/g, '')
    .trim();
}

/**
 * 🟢 זיהוי שם חברה היברידי (Vendor Rules + Generic Fallback)
 */
function detectCompanyNameGeneric(filename, text, parsed) {
  const cleanTextNoSpaces = text.replace(/\s+/g, '');

  // 1. בדיקת מילון ספקים נפוצים
  for (const v of VENDOR_RULES) {
    if (v.pattern.test(text) || v.pattern.test(cleanTextNoSpaces) || v.pattern.test(filename)) {
      return v.name;
    }
  }

  // 2. סריקת Header גנרית (בלי ללכוד שורות "לכבוד" או את שם הלקוח)
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let isInsideBillToBlock = false;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (/bill\s*to|billed\s*to|לכבוד|שם\s*הלקוח/i.test(lower)) {
      isInsideBillToBlock = true;
      continue;
    }

    if (isInsideBillToBlock) continue;

    const isStopWord = SYSTEM_STOP_WORDS.some(word => lower.includes(word));
    const digitsCount = (line.match(/\d/g) || []).length;
    const isAddressOrId = digitsCount > 3 || /street|p\.o\.|box|address|road|suite/i.test(lower);

    if (!isStopWord && !isAddressOrId && line.length > 2 && line.length < 60) {
      const cleaned = line.replace(/^מאת:\s*/i, '').replace(/^from:\s*/i, '').trim();
      const finalName = cleanCompanyNameFormatting(cleaned);
      if (finalName && finalName.length > 2) return finalName;
    }
  }

  // 3. Fallback: שם קובץ נקי
  const nameFromFilename = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/^invoice[-_]/i, '')
    .replace(/^receipt[-_]/i, '')
    .replace(/[-_]\d+.*$/i, '')
    .trim();

  if (nameFromFilename.length > 2 && !SYSTEM_STOP_WORDS.some(w => nameFromFilename.toLowerCase().includes(w))) {
    return cleanCompanyNameFormatting(nameFromFilename);
  }

  return null;
}

/**
 * 🟢 מנוע חילוץ סכום סופי מושלם (תופס 205.80 ₪ בג'יטייס, 99 ₪ בסיטי וואש ו-364.57 ₪ בחברת החשמל)
 */
function extractAmountFromTextGeneric(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. ניקוי ממוקד של רווחים פנימיים בין ספרות (סיטי וואש "9 9 . 0 0" -> "99.00", ג'יטייס "2 0 5 . 8 0" -> "205.80")
  const cleanText = text.replace(/(\d)\s+(\d)/g, '$1$2');

  // 2. עדיפות עליונה: חשבוניות דולריות (Anthropic / Stripe Total)
  const usdTotals = [];
  const dollarRegex = /(?:total|amount\s*due|grand\s*total|subtotal|balance\s*due)\s*[:\=-]?\s*\$?\s*([\d,]+(?:\.\d{2})?)|\$\s*([\d,]+(?:\.\d{2})?)\s*(?:due|total|usd)/gi;
  let dMatch;

  while ((dMatch = dollarRegex.exec(cleanText)) !== null) {
    const valStr = dMatch[1] || dMatch[2];
    if (valStr) {
      const val = parseFloat(valStr.replace(/,/g, ''));
      if (val > 0 && val < 1000000) usdTotals.push(val);
    }
  }

  if (usdTotals.length > 0) {
    return Math.max(...usdTotals);
  }

  const lines = cleanText.split('\n');

  // 3. עדיפות שנייה: סריקת שורות סה"כ / לתשלום / חיוב / שולם בעברית (חילוץ הערך החיובי המקסימלי בשורה)
  for (const line of lines) {
    if (/(?:סה"כ|סה״כ|סך\s*הכל|לתשלום|חיוב|שולם|סכום\s*כולל|חויב\s*בסך)/i.test(line)) {
      const rawNumbers = line.match(/\d+(?:\.\d{1,2})?/g);
      if (rawNumbers && rawNumbers.length > 0) {
        const validValues = rawNumbers
          .map(n => parseFloat(n))
          .filter(val => val > 0 && val < 1000000 && !(val >= 1990 && val <= 2030));

        if (validValues.length > 0) {
          return Math.max(...validValues);
        }
      }
    }
  }

  // 4. Score Engine Fallback – דירוג מועמדים לפי תגיות, אגורות ומיקום
  const candidates = [];
  const numberRegex = /\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\b|\b\d+(?:\.\d{1,2})?\b/g;

  lines.forEach((lineText, lineIndex) => {
    let numMatch;
    while ((numMatch = numberRegex.exec(lineText)) !== null) {
      const rawMatch = numMatch[0];
      const val = parseFloat(rawMatch.replace(/,/g, ''));

      if (isNaN(val) || val <= 0) continue;

      // 🛑 פילטר חסימה: התעלמות ממספרים שלמים גדולים מ-500 ללא נקודה (חוסם מזהים מחוברים ושנים)
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

      // 🌟 מתן בונוס חזק למספרים עשרוניים בעלי 2 ספרות אגורות (מנצח את 50 ולוכד את 205.80 / 162.11 / 2144.52)
      if (rawMatch.includes('.') && rawMatch.split('.')[1].length === 2) {
        score += 400;
      }

      if (/[₪$€]|ש"?ח|USD|EUR/i.test(lineText)) {
        score += 150;
      }

      score += (lineIndex / lines.length) * 20;

      candidates.push({ value: val, score });
    }
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score || b.value - a.value);
  return candidates[0].value;
}

// זיהוי מטבע מתוך הטקסט
function detectCurrency(text, parsedCurrency) {
  if (parsedCurrency) return parsedCurrency;
  if (/\bUSD\b|\$/i.test(text)) return 'USD';
  if (/\bEUR\b|€/i.test(text)) return 'EUR';
  return 'ILS';
}

const triggerEmailScan = async (req, res) => {
  console.log('Email Scan START');
  try {
    const userId = req.user?.id || req.user?.userId;

    const tokenResult = await pool.query(
      'SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = $1 AND provider = $2',
      [userId, 'google']
    );

    const tokenRow = tokenResult.rows[0];

    if (!tokenRow || !tokenRow.access_token) {
      console.log('Email Scan Ended With Error: No Google tokens found for user ID:', userId);
      return res.status(400).json({ error: 'לא נמצאו נתוני התחברות לגוגל. אנא התחבר מחדש.' });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
      expiry_date: tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : null
    });

    const gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client
    });

    const emailsResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'has:attachment (invoice OR receipt OR חשבונית) filename:pdf',
      maxResults: 10
    });

    const messages = emailsResponse.data.messages || [];

    if (messages.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'לא נמצאו מיילים עם קבצים',
        data: { count: 0 }
      });
    }

    let newDocumentsCount = 0;
    console.log('Found emails:', messages.length);

    for (const message of messages) {
      const messageId = message.id;

      const existing = await pool.query(
        `
        SELECT id
        FROM documents
        WHERE gmail_message_id = $1
        `,
        [messageId]
      );

      // if (existing.rows.length > 0) {
      //   console.log('Skipping existing email:', messageId);
      //   continue;
      // }

      const email = await gmail.users.messages.get({
        userId: 'me',
        id: messageId
      });

      const headers = email.data.payload.headers;
      const from = headers.find((h) => h.name === 'From')?.value || 'Unknown sender';
      const receivedDate = headers.find((h) => h.name === 'Date')?.value || new Date();

      console.log('Found email:', messageId);

      const attachment = email.data.payload.parts?.find(
        (part) => part.filename && part.body.attachmentId
      );

      if (!attachment?.mimeType?.includes('pdf')) {
        console.log('Skipping non PDF:', attachment?.filename);
        continue;
      }

      const filename = attachment.filename;
      const { generateFileHash } = require('../utils/fileHash');

      const attachmentResponse = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachment.body.attachmentId
      });

      const data = attachmentResponse.data.data.replace(/-/g, '+').replace(/_/g, '/');
      const fileBuffer = Buffer.from(data, 'base64');
      const baseDocumentHash = generateFileHash(fileBuffer);

      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // 🟢 ניקוי נקודתיים ותווים לא חוקיים משם הקובץ עבור Windows
      const safeFilename = filename.replace(/[:*?"<>|]/g, '_');
      const savedFileName = `${Date.now()}-${safeFilename}`;
      const savedFilePath = path.join(uploadDir, savedFileName);

      fs.writeFileSync(savedFilePath, fileBuffer);

      let pagesText = [];
      try {
        pagesText = await extractPagesFromPdf(savedFilePath);
      } catch (err) {
        console.error('Cannot parse PDF:', filename, err.message);
        continue;
      }

      console.log(`Processing ${pagesText.length} pages for file: ${filename}`);

      for (let pageIndex = 0; pageIndex < pagesText.length; pageIndex++) {
        const rawPageText = pagesText[pageIndex] || '';
        const flatText = rawPageText.replace(/\s+/g, ' ');

        const isInfoOnlyPage =
          /דברי\s*הסבר|תעריפי\s*המים|אחריות\s*הצרכן|עדכון\s*מספר\s*נפשות|בירור\s*חשבון|חוק\s*עזרי|מרכיבי\s*התעריף/i.test(flatText) &&
          !/תזכורת\s*לתשלום|יתרת\s*חוב|סכום\s*לתשלום/i.test(flatText);

        if (isInfoOnlyPage) {
          console.log(`[Page ${pageIndex + 1}/${pagesText.length}] Skipping info page in ${filename}`);
          continue;
        }

        const normalizedPageText = rawPageText
          .replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .join('\n');

        const parsed = parseDocument(normalizedPageText);
        const amountValue = extractAmountFromTextGeneric(normalizedPageText);

        if (!amountValue || amountValue <= 0 || amountValue > 100000) {
          console.log(`[Page ${pageIndex + 1}/${pagesText.length}] No valid amount found, skipping`);
          continue;
        }

        const isDebtReminder = /תזכורת לתשלום חוב|יתרת חוב|דרישת חוב/i.test(flatText);
        const finalDocumentType = isDebtReminder ? 'reminder' : (parsed.documentType || (pagesText.length > 1 ? 'receipt' : 'invoice'));
        const companyNameClean = detectCompanyNameGeneric(filename, normalizedPageText, parsed);
        const currencyVal = detectCurrency(normalizedPageText, parsed.currency);

        // 🟢 חילוץ וסנכרון תאריך החשבונית (עם גיבוי לתאריך קבלת המייל)
        const extractedDate = normalizeDate(parsed.date) || safeDate(receivedDate);
        const invoiceDate = extractedDate ? new Date(extractedDate) : null;
        const pageDocumentHash = pagesText.length > 1 ? `${baseDocumentHash}_page_${pageIndex + 1}` : baseDocumentHash;
        const finalSummary = `${finalDocumentType.toUpperCase()} - ${amountValue} ${currencyVal}`;

        console.log(`[Page ${pageIndex + 1}/${pagesText.length}] Saving doc:`, {
          filename,
          documentType: finalDocumentType,
          amount: amountValue,
          currency: currencyVal,
          company: companyNameClean
        });


        // 🟢 הגדרת קטגוריה וסטטוס תשלום
        const categoryVal = finalDocumentType === 'receipt' ? 'קבלות' : 'חשבוניות';
        const paymentStatusVal = finalDocumentType === 'receipt' ? 'paid' : 'pending';

        // 1. בדיקה האם המסמך כבר קיים לפי ה-Hash
        // 🟢 1. בדיקה האם המסמך כבר קיים לפי ה-Hash
        const existingHash = await pool.query(
          'SELECT id FROM documents WHERE document_hash = $1',
          [pageDocumentHash]
        );

        if (existingHash.rows.length === 0) {
          // 🟢 2. הכנסה ל-DB כולל file_path (savedFilePath)
          await pool.query(
            `INSERT INTO documents 
     (user_id, title, company_name, amount, currency, document_type, category, payment_status, invoice_date, document_hash, gmail_message_id, file_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              userId,             // $1
              filename,           // $2
              companyNameClean,   // $3
              amountValue,        // $4
              currencyVal,        // $5
              finalDocumentType,  // $6
              categoryVal,        // $7
              paymentStatusVal,   // $8
              invoiceDate,        // $9
              pageDocumentHash,   // $10
              messageId,          // $11
              savedFilePath       // $12 👈 השדה שהיה חסר!
            ]
          );

          newDocumentsCount++;


          console.log(`[Page ${pageIndex + 1}/${pagesText.length}] Saved doc:`, {
            filename,
            documentType: finalDocumentType,
            amount: amountValue,
            currency: currencyVal,
            company: companyNameClean,
            hash: pageDocumentHash
          });
        } else {
          console.log(`[Page ${pageIndex + 1}/${pagesText.length}] Skipping existing doc hash:`, pageDocumentHash);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'סריקת בדיקה הסתיימה',
      data: {
        count: newDocumentsCount
      }
    });
  } catch (error) {
    console.error('Error in triggerEmailScan:', error);
    if (error.message && error.message.includes('invalid_grant')) {
      return res.status(401).json({ error: 'פג תוקף ההרשאה מול גוגל. אנא התחבר מחדש דרך האפליקציה.' });
    }
    return res.status(500).json({ error: 'שגיאה פנימית בסריקת המיילים' });
  }
};

const downloadDocument = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT file_path, title
      FROM documents
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];
    if (!doc.file_path || !fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.download(doc.file_path, doc.title);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Download failed' });
  }
};

module.exports = {
  getDocuments,
  triggerEmailScan,
  downloadDocument
};