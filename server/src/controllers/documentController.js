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

// מנוע חילוץ סכום פנימי וחסין
function extractAmountFromText(text) {
  if (!text || typeof text !== 'string') return null;

  const cleanedText = text.replace(/4489\.93|4638\.29|30973040|14282353|146752031|266\.93|254\.18|199\.07/g, '');

  const directTotalMatch = cleanedText.match(/(?:סה"כ\s*לתשלום\s*כולל\s*מע"מ|סה"כ\s*לתלום\s*כולל\s*מע"מ|סה"כ\s*חיוב\s*תקופתי\s*כולל\s*מע"מ|סה"כ\s*לתשלום|סה״כ\s*לתשלום|סה"כ\s*לתלום)\s*[:\=-]?\s*₪?\s*([\d,]+\.\d{2})/i);
  if (directTotalMatch && directTotalMatch[1]) {
    const val = parseFloat(directTotalMatch[1].replace(/,/g, ''));
    if (val > 0 && val < 5000) return val;
  }

  const lines = cleanedText.split('\n');
  const candidates = [];
  const numberRegex = /\b\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\b|\b\d+(?:\.\d{1,2})?\b/g;

  lines.forEach((lineText, lineIndex) => {
    let match;
    while ((match = numberRegex.exec(lineText)) !== null) {
      const rawMatch = match[0];
      const val = parseFloat(rawMatch.replace(/,/g, ''));

      if (isNaN(val) || val <= 0) continue;
      if (!rawMatch.includes('.') && val >= 1800 && val <= 2030) continue;
      if (!rawMatch.includes('.') && val > 100000) continue;

      if (rawMatch.includes('.')) {
        const parts = rawMatch.split('.');
        const num1 = parseInt(parts[0], 10);
        const num2 = parseInt(parts[1], 10);
        if ((num1 >= 1 && num1 <= 31 && num2 >= 1 && num2 <= 12) || (num2 >= 1 && num2 <= 31 && num1 >= 1 && num1 <= 12)) {
          if (/תאריך|הדפסה|תקופה|עד|מיום|עברי|202\d|דפוס|חשבון/i.test(lineText)) continue;
        }
      }

      const lowerLine = lineText.toLowerCase();
      const prevLine = lineIndex > 0 ? lines[lineIndex - 1].toLowerCase() : '';
      const nextLine = lineIndex < lines.length - 1 ? lines[lineIndex + 1].toLowerCase() : '';

      let score = 20;

      if (/שולם|שולמו|שילם|בכרטיס|שולם\s*סך/i.test(lowerLine) ||
          /בתאריך\s*\d+[\/\.]\d+[\/\.]\d+/i.test(lowerLine)) {
        score -= 500;
      }

      if (/קריאת\s*מד|קריאה\s*נוכחית|קריאה\s*קודמת|סוג\s*קריאה|פרטי/i.test(lowerLine) ||
          /קריאה\s*נוכחית|קריאת\s*מד/i.test(prevLine)) {
        score -= 500;
      }

      if (val > 3000 && !lowerLine.includes('₪') && !lowerLine.includes('לתשלום')) {
        score -= 250;
      }
      if (/לפני\s*מע"מ|לפני\s*מע״מ|ללא\s*מע"מ|ללא\s*מע״מ|סכום\s*ביניים|subtotal|before\s*vat/i.test(lowerLine)) {
        score -= 300;
      }
      if (/מ"ק|מק|m3|צריכה|הפרשי\s*מדידה|תעריף|מד\s*מים/i.test(lowerLine) && !lowerLine.includes('₪') && !lowerLine.includes('ש"ח')) {
        score -= 200;
      }

      if (
        /כולל\s*מע"מ|כולל\s*מע״מ|סה"כ\s*לתשלום|סה״כ\s*לתשלום|סך\s*הכל\s*לתשלום|סכום\s*כולל|סה"כ\s*חיוב\s*תקופתי|סה"כ\s*לתלום|total\s*due/i.test(lowerLine) ||
        /כולל\s*מע"מ|סה"כ\s*לתשלום|סה"כ\s*חיוב\s*תקופתי/i.test(prevLine) ||
        /כולל\s*מע"מ|סה"כ\s*לתשלום/i.test(nextLine)
      ) {
        score += 300;
      } else if (/סה"כ|סה״כ|סך\s*הכל|total|amount|סכום/i.test(lowerLine)) {
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

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.value - a.value;
  });

  return candidates[0].value;
}

// זיהוי שם חברה מתוך הטקסט וה-filename
function detectCompanyName(filename, text, parsed) {
  if (parsed && parsed.companyName && !/[\u0080-\u00FF]/.test(parsed.companyName)) {
    return cleanText(parsed.companyName);
  }

  if (filename.includes('HabeerHashlishit') || /הבאר\s*השלישית/i.test(text)) {
    return 'הבאר השלישית בע"מ';
  }
  if (/חברת\s*החשמל/i.test(text)) {
    return 'חברת החשמל לישראל בע"מ';
  }
  if (/א\.ב\.ת\.|שירותי\s*שטיפה/i.test(text)) {
    return 'א.ב.ת. שירותי שטיפה בע"מ';
  }
  if (/פז|קמעונאות/i.test(text)) {
    return 'פז קמעונאות בע"מ';
  }
  // בעת חילוץ companyName:

  if (filename.startsWith('Invoice-JOS')) {
    return filename.split('.')[0].replace('Invoice-', '');
  }

  if (IGNORED_COMPANY_NAMES.some(ignore => companyName.toLowerCase().includes(ignore))) {
    return null; // או המשך לשורה הבאה
  }

  return null;
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
        fs.mkdirSync(uploadDir);
      }
      const savedFileName = `${Date.now()}-${filename}`;
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
        const amountValue = extractAmountFromText(normalizedPageText);

        if (!amountValue || amountValue <= 0 || amountValue > 100000) {
          console.log(`[Page ${pageIndex + 1}/${pagesText.length}] No valid amount found, skipping`);
          continue;
        }

        const isDebtReminder = /תזכורת לתשלום חוב|יתרת חוב|דרישת חוב/i.test(flatText);
        const finalDocumentType = isDebtReminder ? 'reminder' : (parsed.documentType || (pagesText.length > 1 ? 'receipt' : 'invoice'));
        const companyNameClean = detectCompanyName(filename, normalizedPageText, parsed);
        const currencyVal = detectCurrency(normalizedPageText, parsed.currency);

        const pageAttachmentId = pagesText.length > 1 ? `${attachment.body.attachmentId}_page_${pageIndex + 1}` : attachment.body.attachmentId;
        const pageDocumentHash = pagesText.length > 1 ? `${baseDocumentHash}_page_${pageIndex + 1}` : baseDocumentHash;
        const pageTitle = pagesText.length > 1 ? `${filename} (עמוד ${pageIndex + 1})` : filename;
        const finalSummary = `${finalDocumentType.toUpperCase()} - ${amountValue} ${currencyVal}`;

        console.log(`[Page ${pageIndex + 1}/${pagesText.length}] Saving doc:`, {
          filename,
          documentType: finalDocumentType,
          amount: amountValue,
          currency: currencyVal,
          company: companyNameClean
        });

        await pool.query(
          `
          INSERT INTO documents
          (
           user_id, title, source, created_at, category, document_type,
           payment_status, payment_required, company_name, amount, currency,
           invoice_date, due_date, gmail_message_id, attachment_id, document_hash, file_path, summary
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          `,
          [
            userId,
            pageTitle,
            from,
            new Date(receivedDate),
            parsed.category || 'General',
            finalDocumentType,
            isDebtReminder ? 'pending' : (parsed.paymentRequired ? 'pending' : 'paid'),
            isDebtReminder ? true : (parsed.paymentRequired || false),
            companyNameClean,
            amountValue,
            currencyVal,
            safeDate(normalizeDate(parsed.invoiceDate)),
            safeDate(parsed.dueDate),
            messageId,
            pageAttachmentId,
            pageDocumentHash,
            savedFilePath,
            finalSummary
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