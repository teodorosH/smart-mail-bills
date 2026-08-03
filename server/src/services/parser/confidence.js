function calculateConfidence(parsed){

    let score=0;

    if(parsed.companyName)
        score+=20;

    if(parsed.invoiceNumber)
        score+=20;

    if(parsed.amount)
        score+=20;

    if(parsed.currency)
        score+=15;

    if(parsed.invoiceDate)
        score+=15;

    if(parsed.documentType!=="other")
        score+=10;

    return score;
}

module.exports={
    calculateConfidence
}