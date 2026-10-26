
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../auth/authenticate.js";
import { authorize } from "../auth/authorize.js";
import { recordAuditLog } from "../lib/audit.js";
import { randomUUID } from "node:crypto";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function readBoolean(value: unknown): boolean | null {
  if (value === undefined || value === "") return false;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  return null;
}

router.post(
  "/",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Veuillez joindre un fichier CSV dans le champ 'file'.",
      });
    }
    if (!req.file.originalname.toLowerCase().endsWith(".csv")) {
  return res.status(400).json({
    success: false,
    message: "Format de fichier invalide. Veuillez envoyer un fichier .csv.",
  });
}

    let rows: Record<string, string>[];

    try {
      rows = parse(req.file.buffer.toString("utf8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: false,
      }) as Record<string, string>[];
    } catch {
      return res.status(400).json({
        success: false,
        message: "Le fichier CSV est invalide ou mal formaté.",
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Le fichier CSV ne contient aucune ligne à importer.",
      });
    }

    if (rows.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Le fichier ne peut pas contenir plus de 500 colis par import.",
      });
    }

    const requiredHeaders = [
      "recipientName",
      "recipientPhone",
      "deliveryZone",
    ];

    const headers = Object.keys(rows[0] ?? {});
    const missingHeaders = requiredHeaders.filter(
      (header) => !headers.includes(header),
    );

    if (missingHeaders.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Colonnes obligatoires manquantes.",
        missingHeaders,
      });
    }

    const results: {
      row: number;
      trackingNumber?: string;
      error?: string;
    }[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNumber = index + 2;

      try {
        const recipientName = row.recipientName?.trim();
        const recipientPhone = row.recipientPhone?.trim();
        const deliveryZone = row.deliveryZone?.trim();

        if (!recipientName || !recipientPhone || !deliveryZone) {
          throw new Error("Nom, téléphone et zone de livraison obligatoires.");
        }

        const isExpress = readBoolean(row.isExpress);
        const isBulky = readBoolean(row.isBulky);
        const isCashOnDelivery = readBoolean(row.isCashOnDelivery);

        if (
          isExpress === null ||
          isBulky === null ||
          isCashOnDelivery === null
        ) {
          throw new Error(
            "Les options doivent contenir true ou false.",
          );
        }

        const pricingRule = await prisma.pricingRule.findFirst({
          where: { zone: deliveryZone, isActive: true },
        });

        if (!pricingRule) {
          throw new Error(`Aucun tarif actif pour la zone "${deliveryZone}".`);
        }

        const agencyId = row.agencyId?.trim() || null;

        if (agencyId) {
          const agency = await prisma.agency.findUnique({
            where: { id: agencyId },
            select: { id: true, isActive: true },
          });

          if (!agency || !agency.isActive) {
            throw new Error("Agence introuvable ou inactive.");
          }
        }

        const externalTrackingNumber =
          row.externalTrackingNumber?.trim() || null;

        if (externalTrackingNumber) {
          const duplicate = await prisma.parcel.findFirst({
            where: { externalTrackingNumber },
            select: { id: true },
          });

          if (duplicate) {
            throw new Error("Ce numéro de suivi externe existe déjà.");
          }
        }

        const deliveryFee =
          pricingRule.baseFee +
          (isExpress ? pricingRule.expressSurcharge : 0) +
          (isBulky ? pricingRule.bulkySurcharge : 0) +
          (isCashOnDelivery
            ? pricingRule.cashOnDeliverySurcharge
            : 0);

        const trackingNumber =
  `NEX-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

        const parcel = await prisma.parcel.create({
          data: {
            trackingNumber,
            recipientConfirmationToken: randomUUID(),
            externalTrackingNumber,
            sendingAgency: row.sendingAgency?.trim() || null,
            agencyId,
            recipientName,
            recipientPhone,
            recipientAddress: row.recipientAddress?.trim() || null,
            deliveryInstructions: row.deliveryInstructions?.trim() || null,
            description: row.description?.trim() || null,
            conditionOnArrival: row.conditionOnArrival?.trim() || null,
            sealNumber: row.sealNumber?.trim() || null,
            deliveryZone,
            deliveryFee,
            isExpress,
            isBulky,
            isCashOnDelivery,
            registeredById: req.user!.userId,
            statusHistory: {
              create: {
                status: "RECEIVED",
                note: "Colis importé depuis un fichier CSV.",
                changedById: req.user!.userId,
              },
            },
          },
        });

        await recordAuditLog({
          userId: req.user!.userId,
          action: "PARCEL_IMPORTED",
          entity: "Parcel",
          entityId: parcel.id,
          details: `Import CSV : ${parcel.trackingNumber}`,
        });

        results.push({
          row: rowNumber,
          trackingNumber: parcel.trackingNumber,
        });
      } catch (error) {
        results.push({
          row: rowNumber,
          error:
            error instanceof Error
              ? error.message
              : "Erreur inconnue pendant l'import.",
        });
      }
    }

    const imported = results.filter((result) => result.trackingNumber).length;
    const failed = results.length - imported;

    return res.status(200).json({
      success: true,
      message: "Import CSV terminé.",
      total: rows.length,
      imported,
      failed,
      results,
    });
  },
);

export default router;
