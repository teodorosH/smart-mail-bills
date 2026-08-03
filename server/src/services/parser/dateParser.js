function isValidDate(value){

    const parts =
        value.split(/[\/.-]/);


    if(parts.length !== 3){
        return false;
    }


    let day;
    let month;
    let year;


    if(parts[0].length === 4){

        year = Number(parts[0]);
        month = Number(parts[1]);
        day = Number(parts[2]);

    }
    else {

        day = Number(parts[0]);
        month = Number(parts[1]);
        year = Number(parts[2]);

    }


    // שנים הגיוניות
    if(
        year < 2000 ||
        year > 2100
    ){
        return false;
    }


    if(
        month < 1 ||
        month > 12
    ){
        return false;
    }


    if(
        day < 1 ||
        day > 31
    ){
        return false;
    }


    return true;
}



function extractInvoiceDate(text){

    const patterns=[

        /\b\d{2}\/\d{2}\/\d{4}\b/,

        /\b\d{2}\.\d{2}\.\d{4}\b/,
        /\b\d{4}-\d{2}-\d{2}\b/
    ];


    for(const p of patterns){

        const m=text.match(p);

        if(m)
            return m[0];

    }


    return null;
}




function extractDueDate(text){


    const regex =
        /(?:due|due date|payment due|מועד אחרון לתשלום|לתשלום עד)[^\n]{0,50}?(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i;



    const match =
        text.match(regex);



    if(
        match &&
        isValidDate(match[1])
    ){
        return match[1];
    }


    return null;
}



module.exports={
    extractInvoiceDate,
    extractDueDate
};