const sanitizeText = (text) => {

  return text
    // אימיילים
    .replace(
      /[\w.-]+@[\w.-]+\.\w+/g,
      '[EMAIL_REMOVED]'
    )

    // טלפונים
    .replace(
      /\+?\d[\d\s-]{7,}\d/g,
      '[PHONE_REMOVED]'
    )

    // מספרי כרטיס אשראי
    .replace(
      /\b\d{13,19}\b/g,
      '[CARD_REMOVED]'
    )

    // מספרי חשבון ארוכים
    .replace(
      /\b\d{8,}\b/g,
      '[NUMBER_REMOVED]'
    );
};


module.exports = {
  sanitizeText
};