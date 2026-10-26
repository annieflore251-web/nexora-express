
import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../auth/authenticate.js";
import { authorize } from "../auth/authorize.js";

const router = Router();

router.use(authenticate);

const surchargeFields = [
  "expressSurcharge",
  "bulkySurcharge",
  "cashOnDeliverySurcharge",
  "secondPresentationSurcharge",
] as const;

const allowedFields = [
  "zone",
  "baseFee",
  ...surchargeFields,
  "isActive",
] as const;

function validAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function validZone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 100
  );
}

// List all pricing rules
router.get(
  "/",
  authorize("ADMIN", "COORDINATOR"),
  async (_req, res) => {
    try {
      const rules = await prisma.pricingRule.findMany({
        orderBy: { zone: "asc" },
      });

      return res.json({ success: true, data: rules });
    } catch (error) {
      console.error("List pricing rules error:", error);
      return res.status(500).json({
        success: false,
        message: "Impossible de récupérer les tarifs.",
      });
    }
  },
);

// Create a pricing rule
router.post(
  "/",
  authorize("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body ?? {};
      const {
        zone,
        baseFee,
        expressSurcharge = 0,
        bulkySurcharge = 0,
        cashOnDeliverySurcharge = 0,
        secondPresentationSurcharge = 0,
      } = body;

      if (!validZone(zone)) {
        return res.status(400).json({
          success: false,
          message: "Le nom de la zone est obligatoire.",
        });
      }

      const amounts = {
        baseFee,
        expressSurcharge,
        bulkySurcharge,
        cashOnDeliverySurcharge,
        secondPresentationSurcharge,
      };

      if (
        !validAmount(baseFee) ||
        !surchargeFields.every((field) =>
          validAmount(amounts[field]),
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Les tarifs doivent être des nombres entiers positifs ou nuls en FCFA.",
        });
      }

      const rule = await prisma.pricingRule.create({
        data: {
          zone: zone.trim(),
          ...amounts,
        },
      });

      return res.status(201).json({
        success: true,
        message: "Tarif créé avec succès.",
        data: rule,
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return res.status(409).json({
          success: false,
          message: "Cette zone possède déjà un tarif.",
        });
      }

      console.error("Create pricing rule error:", error);
      return res.status(500).json({
        success: false,
        message: "Impossible de créer le tarif.",
      });
    }
  },
);

// Update a pricing rule
router.patch(
  "/:id",
  authorize("ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body ?? {};
      const keys = Object.keys(body);

      if (
        keys.length === 0 ||
        keys.some((key) => !(allowedFields as readonly string[]).includes(key))
      ) {
        return res.status(400).json({
          success: false,
          message: "Aucun champ valide à modifier.",
        });
      }

      if ("zone" in body && !validZone(body.zone)) {
        return res.status(400).json({
          success: false,
          message: "Le nom de la zone est invalide.",
        });
      }

      for (const field of [
        "baseFee",
        ...surchargeFields,
      ] as const) {
        if (field in body && !validAmount(body[field])) {
          return res.status(400).json({
            success: false,
            message: `${field} doit être un entier positif ou nul.`,
          });
        }
      }

      if ("isActive" in body && typeof body.isActive !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isActive doit être un booléen.",
        });
      }

      const data = {
        ...body,
        ...(typeof body.zone === "string"
          ? { zone: body.zone.trim() }
          : {}),
      };

      const rule = await prisma.pricingRule.update({
        where: { id: id as string },
        data,
      });

      return res.json({
        success: true,
        message: "Tarif mis à jour avec succès.",
        data: rule,
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error
      ) {
        if (error.code === "P2025") {
          return res.status(404).json({
            success: false,
            message: "Tarif introuvable.",
          });
        }

        if (error.code === "P2002") {
          return res.status(409).json({
            success: false,
            message: "Cette zone possède déjà un tarif.",
          });
        }
      }

      console.error("Update pricing rule error:", error);
      return res.status(500).json({
        success: false,
        message: "Impossible de modifier le tarif.",
      });
    }
  },
);

// Calculate a delivery fee
router.post(
  "/calculate",
  authorize("ADMIN", "COORDINATOR"),
  async (req, res) => {
    try {
      const {
        zone,
        isExpress = false,
        isBulky = false,
        isCashOnDelivery = false,
        isSecondPresentation = false,
      } = req.body ?? {};

      if (!validZone(zone)) {
        return res.status(400).json({
          success: false,
          message: "Une zone de livraison valide est obligatoire.",
        });
      }

      const options = {
        isExpress,
        isBulky,
        isCashOnDelivery,
        isSecondPresentation,
      };

      if (
        Object.values(options).some(
          (value) => typeof value !== "boolean",
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Les options doivent être des valeurs booléennes.",
        });
      }

      const rule = await prisma.pricingRule.findFirst({
        where: {
          zone: zone.trim(),
          isActive: true,
        },
      });

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: "Aucun tarif actif n'est configuré pour cette zone.",
        });
      }

      const breakdown = {
        baseFee: rule.baseFee,
        expressSurcharge: isExpress ? rule.expressSurcharge : 0,
        bulkySurcharge: isBulky ? rule.bulkySurcharge : 0,
        cashOnDeliverySurcharge: isCashOnDelivery
          ? rule.cashOnDeliverySurcharge
          : 0,
        secondPresentationSurcharge: isSecondPresentation
          ? rule.secondPresentationSurcharge
          : 0,
      };

      const total = Object.values(breakdown).reduce(
        (sum, amount) => sum + amount,
        0,
      );

      return res.json({
        success: true,
        currency: "XAF",
        zone: rule.zone,
        breakdown,
        total,
      });
    } catch (error) {
      console.error("Calculate delivery fee error:", error);
      return res.status(500).json({
        success: false,
        message: "Impossible de calculer les frais de livraison.",
      });
    }
  },
);

export default router;
