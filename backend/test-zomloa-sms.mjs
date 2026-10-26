import "dotenv/config";

const apiKey = process.env.ZOMLOA_API_KEY;

if (!apiKey) {
  console.error("ZOMLOA_API_KEY is missing from .env");
  process.exit(1);
}

const mobile = process.env.TEST_SMS_MOBILE;

if (!mobile) {
  console.error("Add TEST_SMS_MOBILE to .env first.");
  process.exit(1);
}

const response = await fetch(
  "https://api.sms.zomloa.app/api/v1/gateway/sms/send",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      countryCode: "CM",
      sms: "NEXORA EXPRESS: Test SMS. Please ignore this message.",
      mobiles: mobile,
    }),
  }
);

const result = await response.json();
console.log("HTTP status:", response.status);
console.log("API response:", JSON.stringify(result, null, 2));