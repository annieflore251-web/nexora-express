
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./authenticate.js";

type Role = "ADMIN" | "COORDINATOR" | "COURIER" | "PARTNER";

export function authorize(...allowedRoles: Role[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentification requise.",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message:
          "Vous n'avez pas l'autorisation d'accéder à cette ressource.",
      });
      return;
    }

    next();
  };
}
