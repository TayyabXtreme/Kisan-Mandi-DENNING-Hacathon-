// Server and zod schemas return error codes; these are the English texts.
const MESSAGES: Record<string, string> = {
  NAME_SHORT: "Enter your full name.",
  NAME_LONG: "Keep your name under 60 characters.",
  EMAIL_INVALID: "Enter a valid email, like name@example.com.",
  PHONE_INVALID: "Enter a 10-digit mobile number, like 300 0000 123.",
  DISTRICT_REQUIRED: "Choose your district.",
  ROLE_REQUIRED: "Choose Farmer or Buyer.",
  CROP_REQUIRED: "Choose a crop.",
  CROP_NAME_SHORT: "Enter the crop name.",
  CROP_NAME_LONG: "Keep the name under 40 characters.",
  CROP_NAME_INVALID: "Use letters only.",
  CATEGORY_REQUIRED: "Choose a type.",
  MARKET_REQUIRED: "Choose a market.",
  MARKET_NAME_SHORT: "Enter the market name.",
  MARKET_NAME_LONG: "Keep the name under 50 characters.",
  MARKET_NAME_INVALID: "Use letters and numbers only.",
  NOTE_LONG: "Keep the note under 200 characters.",
  PRICES_REQUIRED: "Enter at least one price.",
  TOPIC_REQUIRED: "Choose what it's about.",
  MESSAGE_SHORT: "Write a little more so the admin can help.",
  MESSAGE_LONG: "Keep the message under 500 characters.",
  QTY_POSITIVE: "Must be more than 0",
  QTY_TOO_LARGE: "That quantity is too large.",
  PRICE_POSITIVE: "Must be more than 0",
  PRICE_TOO_LARGE: "That price is too large.",
  GRADE_REQUIRED: "Choose a grade.",
  DATE_PAST: "Date can't be in the past.",
  DATE_INVALID: "Pick a valid date.",
};

export const errorText = (code?: string) =>
  code ? (MESSAGES[code] ?? code) : undefined;
