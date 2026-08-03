const companies={

anthropic:"AI",

openai:"AI",

digitalocean:"Cloud",

aws:"Cloud",

amazon:"Shopping",

google:"Google",

visa:"Finance",

paypal:"Finance",

cellcom:"Communication",

hot:"Communication"
};

function detectCategory(company){

    if(!company)
        return "Other";

    const lower=company.toLowerCase();

    for(const key in companies){

        if(lower.includes(key))
            return companies[key];
    }

    return "Other";
}

module.exports={
    detectCategory
}