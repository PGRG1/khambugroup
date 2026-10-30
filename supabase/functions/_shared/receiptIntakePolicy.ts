const monetary = ["subtotal", "serviceCharge", "discount", "totalSales", "visa", "mastercard", "amex", "unionPay", "jcb", "alipay", "wechat", "payme", "cash", "deliveroo", "foodpanda", "keeta", "cardTips"];
export function receiptReviewReasons(original: Record<string, unknown>, tentative: Record<string, unknown>, venueValid: boolean, hasScan: boolean): string[] {
  const reasons = ["Independent source verification unavailable: balance is not proof of extraction accuracy"];
  if (!venueValid) reasons.push("Venue missing or unmatched");
  if (!hasScan) reasons.push("Original extraction audit unavailable");
  const missing = ["date", "venue", "reportNumber", ...monetary].filter(k => original[k] === null || original[k] === undefined || original[k] === "");
  if (missing.length) reasons.push(`Missing or unclear source fields: ${missing.join(", ")}`);
  const n = (k: string) => Number(tentative[k]);
  if (monetary.some(k => !Number.isFinite(n(k)))) reasons.push("Invalid or missing tentative amounts");
  else {
    if (Math.abs(n("subtotal") + n("serviceCharge") + n("discount") - n("totalSales")) > 0.01) reasons.push("Sales arithmetic does not balance");
    const paid = monetary.filter(k => !["subtotal", "serviceCharge", "discount", "totalSales"].includes(k)).reduce((sum, k) => sum + n(k), 0);
    if (Math.abs(paid - n("totalSales")) > 0.01) reasons.push("Tender components do not match total sales");
    if (n("discount") > 0 || n("cardTips") > 0) reasons.push("Discount or tip deduction sign needs review");
  }
  // Date ranges, session identity and period permission are not independently established here.
  reasons.push("Single-date/session identity and authorised period need source review before posting");
  return reasons;
}