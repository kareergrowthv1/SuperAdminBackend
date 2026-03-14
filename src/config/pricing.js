// Credit Pricing Configuration
const CREDIT_PRICING = {
    INTERVIEW_CREDIT_PRICE: 49.00,  // $49 per interview credit
    POSITION_CREDIT_PRICE: 39.00,   // $39 per position credit
    DEFAULT_TAX_RATE: 18.00,        // 18% GST
    CURRENCY: 'USD'
};

/**
 * Calculate total amount for credits purchase
 * @param {number} interviewCredits - Number of interview credits
 * @param {number} positionCredits - Number of position credits
 * @param {number} taxRate - Tax rate percentage (default 18%)
 * @param {boolean} taxInclusive - Whether price includes tax
 * @returns {object} Pricing breakdown
 */
const calculateCreditAmount = (interviewCredits = 0, positionCredits = 0, taxRate = CREDIT_PRICING.DEFAULT_TAX_RATE, taxInclusive = false) => {
    const interviewAmount = interviewCredits * CREDIT_PRICING.INTERVIEW_CREDIT_PRICE;
    const positionAmount = positionCredits * CREDIT_PRICING.POSITION_CREDIT_PRICE;
    const subTotal = interviewAmount + positionAmount;

    let taxAmount = 0;
    let total = subTotal;

    if (!taxInclusive) {
        taxAmount = (subTotal * taxRate) / 100;
        total = subTotal + taxAmount;
    } else {
        // If tax inclusive, extract tax from total
        const divisor = 1 + (taxRate / 100);
        total = subTotal;
        subTotal = total / divisor;
        taxAmount = total - subTotal;
    }

    return {
        interviewCredits,
        positionCredits,
        interviewCreditsPrice: CREDIT_PRICING.INTERVIEW_CREDIT_PRICE,
        positionCreditsPrice: CREDIT_PRICING.POSITION_CREDIT_PRICE,
        interviewAmount: parseFloat(interviewAmount.toFixed(2)),
        positionAmount: parseFloat(positionAmount.toFixed(2)),
        subTotal: parseFloat(subTotal.toFixed(2)),
        taxRate: parseFloat(taxRate.toFixed(2)),
        taxAmount: parseFloat(taxAmount.toFixed(2)),
        grandTotal: parseFloat(total.toFixed(2)),
        currency: CREDIT_PRICING.CURRENCY
    };
};

module.exports = {
    CREDIT_PRICING,
    calculateCreditAmount
};
