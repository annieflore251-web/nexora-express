
const ZOMLOA_API_URL = "https://api.sms.zomloa.app/api/v1/gateway/sms/send";
const DEFAULT_SENDER_ID = "FlowSMS";

export function normalizeCameroonPhone(phone: string): string {
  let digits = phone.trim().replace(/[\s()+.-]/g, "");

  if (digits.startsWith("00237")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 10) {
    // Cameroon local format, e.g. 06XXXXXXXX
    digits = `237${digits.slice(1)}`;
  } else if (/^6\d{8}$/.test(digits)) {
    // Cameroon mobile without country code
    digits = `237${digits}`;
  }

  if (!/^237[2368]\d{8}$/.test(digits)) {
    throw new Error("Numéro camerounais invalide.");
  }

  return digits;
}

export async function sendZomloaSms(
  phone: string,
  message: string,
): Promise<void> {
  const apiKey = process.env.ZOMLOA_API_KEY;

  if (!apiKey) {
    throw new Error("ZOMLOA_API_KEY est absente de la configuration.");
  }

  const mobile = normalizeCameroonPhone(phone);

  const response = await fetch(ZOMLOA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      senderid: DEFAULT_SENDER_ID,
      countryCode: "CM",
      sms: message,
      mobiles: mobile,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const result = (await response.json().catch(() => null)) as {
    responsecode?: string;
    responsedescription?: string;
    status?: string;
  } | null;

  if (
    !response.ok ||
    result?.responsecode !== "200" ||
    result.status === "FAILED" ||
    result.status === "REJECTED"
  ) {
    throw new Error(
      `Échec de l'envoi SMS Zomloa (HTTP ${response.status}).`,
    );
  }
}
