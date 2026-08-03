function cleanText(text) {

    return text
        // הסרת תווי NULL שגורמים לשגיאת PostgreSQL
        .replace(/\x00/g, '')

        // הסרת תווים בינאריים
        .replace(/[^\x09\x0A\x0D\x20-\x7E\u0590-\u05FF]/g, ' ')

        // איחוד רווחים
        .replace(/[ ]+/g, ' ')

        // שורות ריקות
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n');

}


module.exports = {
    cleanText
};