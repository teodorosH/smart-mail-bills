const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const extractTextFromPdf = async (filePath) => {

  const buffer = fs.readFileSync(filePath);

  const parser = new PDFParse({
    data: buffer
  });

  console.log(buffer.slice(0, 20).toString());
  const result = await parser.getText();

  return result.text;
};

module.exports = {
  extractTextFromPdf
};