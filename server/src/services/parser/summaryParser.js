const buildSummary = ({
    company_name,
    amount,
    currency,
    invoice_date,
    due_date,
    invoice_number,
    document_type,
    payment_required,
    confidence
}) => {
  return {
    company_name: company_name || null,

    amount: amount || null,

    currency: currency || "ILS",

    invoice_date: invoice_date || null,

    due_date: due_date || null,

    document_type: document_type || "other",

    payment_required:
      payment_required === true,

    summary:
      `${company_name || "Unknown"} • ${amount || 0} ${currency || ""}`

  };

};

module.exports = {
  buildSummary
};