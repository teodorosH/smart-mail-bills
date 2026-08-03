const patterns = [

/invoice\s*(?:number|#)?\s*[:#]?\s*([A-Z0-9-]+)/i,

/חשבונית.*?([A-Z0-9-]+)/,

/invoice no\.?\s*([A-Z0-9-]+)/i
];

function extractInvoiceNumber(text){

    for(const p of patterns){

        const match=text.match(p);

        if(match)
            return match[1];
        
    }

    return null;
}

module.exports={
    extractInvoiceNumber
}