const {extractAmount}=require("./amountParser");
const {extractCurrency}=require("./currencyParser");
const {extractCompany}=require("./companyParser");
const {extractInvoiceNumber}=require("./invoiceNumberParser");
const {detectDocumentType}=require("./documentTypeParser");
const {extractInvoiceDate,extractDueDate}=require("./dateParser");
const {detectCategory}=require("./categoryParser");
const {buildSummary}=require("./summaryParser");
const {calculateConfidence}=require("./confidenceParser");

function parseDocument(text){

    const companyName=extractCompany(text);

    const parsed={

        companyName,

        invoiceNumber:extractInvoiceNumber(text),

        amount:extractAmount(text),

        currency:extractCurrency(text),

        invoiceDate:extractInvoiceDate(text),

        dueDate:extractDueDate(text),

        documentType:detectDocumentType(text),

        category:detectCategory(companyName)
    };

    parsed.summary=buildSummary(parsed);

    parsed.confidence=calculateConfidence(parsed);

    return parsed;
}

module.exports={
    parseDocument
};