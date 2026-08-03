const fs = require('fs');
const PDFParser = require('pdf2json');

/**
 * 🟢 תיקון עברית הפוכה (RTL) ואיחוד אותיות מופרדות
 */
function fixHebrewRTL(text) {
  if (!text) return '';

  return text.split('\n').map(line => {
    // בדיקה אם השורה מכילה אותיות עבריות
    const hasHebrew = /[\u0590-\u05FF]/.test(line);

    if (hasHebrew) {
      // אם האותיות מופרדות ברווחים (למשל: "מ ס מ ך"), נצמצם רווחים בודדים
      let cleaned = line.replace(/(?<=[[\u0590-\u05FF])\s+(?=[\u0590-\u05FF])/g, '');

      // הפיכת סדר המילים והאותיות במידה והן הפוכות
      // אם המילה "מסמך" מופיעה כ-"ךמסמ", נבצע היפוך מחרוזת
      const words = cleaned.split(' ');
      const reversedWords = words.map(word => {
        if (/[\u0590-\u05FF]/.test(word)) {
          return word.split('').reverse().join('');
        }
        return word;
      });

      return reversedWords.reverse().join(' ');
    }

    return line;
  }).join('\n');
}

/**
 * חילוץ טקסט מ-PDF בצורה מוגנת ומותאמת לאלגוריתם Parsing
 */
function extractPagesFromPdf(filePath) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on('pdfParser_dataError', (errData) => {
      console.error(`Error reading PDF file ${filePath}:`, errData.parserError);
      reject(errData.parserError);
    });

    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      try {
        const pages = [];

        if (pdfData && pdfData.Pages) {
          pdfData.Pages.forEach((page) => {
            let pageText = '';
            let lastY = null;

            page.Texts.forEach((textItem) => {
              if (lastY !== null && Math.abs(textItem.y - lastY) > 0.3) {
                pageText += '\n';
              }

              textItem.R.forEach((r) => {
                let str = r.T;
                try {
                  str = decodeURIComponent(r.T);
                } catch (e) {
                  str = unescape(r.T);
                }
                pageText += str + ' ';
              });

              lastY = textItem.y;
            });

            // 🟢 הפעלת התיקון לעברית
            const fixedText = fixHebrewRTL(pageText);
            pages.push(fixedText.trim());
          });
        }

        resolve(pages.length > 0 ? pages : ['']);
      } catch (err) {
        reject(err);
      }
    });

    pdfParser.loadPDF(filePath);
  });
}

async function extractTextFromPdf(filePath) {
  const pages = await extractPagesFromPdf(filePath);
  return pages.join('\n');
}

module.exports = {
  extractPagesFromPdf,
  extractTextFromPdf
};