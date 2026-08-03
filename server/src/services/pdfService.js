const fs = require('fs');
const PDFParser = require('pdf2json');

function fixTextLayout(text) {
  if (!text) return '';

  return text.split('\n').map(line => {
    let cleaned = line.replace(/[\x00-\x1F\x7F-\x9F«»"'\~]/g, '').trim();

    // איחוד אותיות אנגליות מרווחות בלבד
    cleaned = cleaned.replace(/(?<=\b[a-zA-Z])\s+(?=[a-zA-Z]\b)/g, '');

    const hasHebrew = /[\u0590-\u05FF]/.test(cleaned);

    if (hasHebrew) {
      const words = cleaned.split(/\s+/);
      const fixedWords = words.map(word => {
        if (/[\u0590-\u05FF]/.test(word)) {
          return word.split('').reverse().join('');
        }
        return word;
      });
      return fixedWords.reverse().join(' ');
    }

    return cleaned.replace(/\s+/g, ' ').trim();
  }).join('\n');
}

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

            const fixedText = fixTextLayout(pageText);
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