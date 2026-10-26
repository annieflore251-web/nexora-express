
import type { Request, Response, NextFunction } from "express";
import "dotenv/config";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "";

if (!JWT_SECRET) {
  throw new Error(
    "La variable d'environnement JWT_SECRET est manquante."
  );
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: "ADMIN" | "COORDINATOR" | "COURIER" | "PARTNER";
    agencyId?: string | null;
  };
}

const validRoles = ["ADMIN", "COORDINATOR", "COURIER", "PARTNER"];

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Le jeton d'authentification est requis.",
    });
    return;
  }

  const token = authorization.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    if (
      typeof payload === "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.role !== "string" ||
      !validRoles.includes(payload.role)
    ) {
      res.status(401).json({
        success: false,
        message: "Le jeton d'authentification est invalide.",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
  id: true,
  role: true,
  isActive: true,
  agencyId: true,
},
    });

    if (!user || !user.isActive || user.role !== payload.role) {
      res.status(401).json({
        success: false,
        message: "Session invalide. Veuillez vous reconnecter.",
      });
      return;
    }

    req.user = {
  userId: user.id,
  role: user.role,
agencyId: user.agencyId,
};
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError ||
        error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: "Le jeton d'authentification est invalide ou expiré.",
      });
      return;
    }

    console.error("Erreur d'authentification :", error);
    res.status(500).json({
      success: false,
      message: "Une erreur inattendue s'est produite.",
    });
  }
}
