const { cleanOcrText } = require('../ocrCleaner');

describe('OCR Cleaner Module', () => {
  test('should fix broken Hebrew text (kerning)', () => {
    const raw = 'ס ה " כ   ל ת ש ל ו ם';
    const result = cleanOcrText(raw);
    expect(result).toBe('סה"כ לתשלום');
  });

  test('should normalize customer lines and numbers without removing line structure', () => {
    const raw = `
ס ה " כ   ל ת ש ל ו ם

₪ 162.11
מספר לקוח 30973040
טלפון 1-800-50-57-57
    `;

    const expected = `סה"כ לתשלום
₪162.11
מספר לקוח 30973040
טלפון 1-800-50-57-57`;

    expect(cleanOcrText(raw)).toBe(expected);
  });
});