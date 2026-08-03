function cleanText(value) {

    if (!value)
        return null;

    return String(value)

        // remove NULL bytes
        .replace(/\0/g, "")

        // remove control chars
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")

        // collapse spaces
        .replace(/\s+/g, " ")

        .trim();

}

module.exports = {
    cleanText
};