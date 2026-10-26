import "dotenv/config";
import jwt from "jsonwebtoken";

const JWT_SECRET: string = process.env.JWT_SECRET || "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from environment variables.");
}

export interface AuthTokenPayload {
  userId: string;
  role: "ADMIN" | "COORDINATOR" | "COURIER" | "PARTNER";
}

export function createAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "1h",
  });
}
