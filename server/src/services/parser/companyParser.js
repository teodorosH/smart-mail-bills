const ignorePatterns = [

    /^page\s+\d+/i,
    /^invoice$/i,
    /^tax invoice/i,
    /^receipt$/i,
    /^bill to/i,
    /^description/i,
    /^date/i,
    /^subtotal/i,
    /^total/i,
    /^amount/i,
    /^qty/i,
    /^quantity/i,
    /^price/i,
    /^unit/i,

    /^חשבונית/,
    /^חשבונית מס/,
    /^חשבונית מס\/קבלה/,
    /^קבלה/,
    /^מסמך ממוחשב/,
    /^לכבוד/,
    /^סה.?כ/,
    /^מע.?מ/,
    /^תאריך/,
    /^פריט/,
    /^כמות/,
    /^מחיר/,
    /^מספר/,
    /^טלפון/,
    /^כתובת/,
    /^רחוב/,
    /^רחובות/,
    /^ישראל/,
    /^payment/i,
    /^amount due/i,
    /^grand total/i,
    /^balance due/i

];

function looksLikeCompany(line) {

    if (!line)
        return false;

    line = line.trim();

    if (line.length < 3)
        return false;

    if (line.length > 70)
        return false;

    if (ignorePatterns.some(r => r.test(line)))
        return false;

    if (line.includes('@'))
        return false;

    if (/https?:\/\//i.test(line))
        return false;

    if (/www\./i.test(line))
        return false;

    if (/^\d+$/.test(line))
        return false;

    // מספרי חשבונית / ח.פ / טלפון
    if (/\d{6,}/.test(line))
        return false;

    // שורת סכומים
    if (/[$₪€£]/.test(line))
        return false;

    // רק תאריך
    if (/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(line))
        return false;

    return true;
}

function extractCompany(text) {

    const lines = text
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(Boolean);

    // עדיפות לשורות הראשונות במסמך
    for (const line of lines.slice(0, 25)) {

        if (!looksLikeCompany(line))
            continue;

        // חברה בע"מ
        if (/בע.?מ/.test(line))
            return line;

        // LLC LTD INC וכו'
        if (/\b(inc|ltd|llc|corp|corporation|company|pbc)\b/i.test(line))
            return line;

        // לפחות שתי מילים
        if (line.split(/\s+/).length >= 2)
            return line;
    }

    // חיפוש נוסף בכל המסמך
    for (const line of lines) {

        if (!looksLikeCompany(line))
            continue;

        return line;
    }

    return null;
}

module.exports = {
    extractCompany
};