
import { Router } from "express";
import {
  randomUUID,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../auth/authenticate.js";
import { authorize } from "../auth/authorize.js";
import { recordAuditLog } from "../lib/audit.js";
import { parcelPhotoUpload } from "../middleware/upload.js";
import { validateUploadedPhoto } from "../middleware/upload.js";
import path from "node:path";
import fs from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { sendZomloaSms } from "../services/zomloa.js";



const router = Router();

function generateTrackingNumber(): string {
  return `NEX-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
function generateDeliveryOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashDeliveryOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function verifyDeliveryOtp(code: string, storedHash: string): boolean {
  const submittedHash = Buffer.from(hashDeliveryOtp(code), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");

  return (
    submittedHash.length === expectedHash.length &&
    timingSafeEqual(submittedHash, expectedHash)
  );
}

// Register a parcel
router.post(
  "/",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
  externalTrackingNumber,
  agencyId,
  sendingAgency,
  deliveryZone,
isExpress = false,
isBulky = false,
isCashOnDelivery = false,
        recipientName,
        recipientPhone,
        recipientAddress,
        deliveryInstructions,
        description,
        conditionOnArrival,
        sealNumber,
            } = req.body as {
        externalTrackingNumber?: string;
        agencyId?: string;
        sendingAgency?: string;
        recipientName?: string;
        recipientPhone?: string;
        recipientAddress?: string;
        deliveryInstructions?: string;
        description?: string;
        conditionOnArrival?: string;
        sealNumber?: string;
        deliveryZone?: string;
isExpress?: boolean;
isBulky?: boolean;
isCashOnDelivery?: boolean;
      };

      if (
        typeof recipientName !== "string" ||
        !recipientName.trim() ||
        typeof recipientPhone !== "string" ||
        !recipientPhone.trim()
      ) {
        res.status(400).json({
          success: false,
          message:
            "Le nom et le numÃ©ro de tÃ©lÃ©phone du destinataire sont obligatoires.",
        });
        return;
      }

      const optionalFields = {
        externalTrackingNumber,
        sendingAgency,
        recipientAddress,
        deliveryInstructions,
        description,
        conditionOnArrival,
        sealNumber,
      };

      for (const [field, value] of Object.entries(optionalFields)) {
        if (value !== undefined && typeof value !== "string") {
          res.status(400).json({
            success: false,
            message: `Le champ ${field} doit Ãªtre une chaÃ®ne de caractÃ¨res.`,
          });
          return;
        }
      }

            if (agencyId !== undefined && typeof agencyId !== "string") {
        res.status(400).json({
          success: false,
          message: "L'identifiant de l'agence doit Ãªtre une chaÃ®ne de caractÃ¨res.",
        });
        return;
      }
if (
  typeof deliveryZone !== "string" ||
  !deliveryZone.trim()
) {
  return res.status(400).json({
    success: false,
    message: "La zone de livraison est obligatoire.",
  });
}

if (
  typeof isExpress !== "boolean" ||
  typeof isBulky !== "boolean" ||
  typeof isCashOnDelivery !== "boolean"
) {
  return res.status(400).json({
    success: false,
    message: "Les options de livraison doivent être booléennes.",
  });
}

const pricingRule = await prisma.pricingRule.findFirst({
  where: {
    zone: deliveryZone.trim(),
    isActive: true,
  },
});

if (!pricingRule) {
  return res.status(400).json({
    success: false,
    message: "Aucun tarif actif n'est configuré pour cette zone.",
  });
}

const deliveryFee =
  pricingRule.baseFee +
  (isExpress ? pricingRule.expressSurcharge : 0) +
  (isBulky ? pricingRule.bulkySurcharge : 0) +
  (isCashOnDelivery ? pricingRule.cashOnDeliverySurcharge : 0);
      const normalizedAgencyId = agencyId?.trim() || null;

      if (normalizedAgencyId) {
        const agency = await prisma.agency.findUnique({
          where: { id: normalizedAgencyId },
          select: { id: true, name: true, isActive: true },
        });

        if (!agency || !agency.isActive) {
          res.status(400).json({
            success: false,
            message: "Agence introuvable ou inactive.",
          });
          return;
        }
      }
      const trackingNumber = generateTrackingNumber();

      const parcel = await prisma.parcel.create({
        data: {
          trackingNumber,
          recipientConfirmationToken: randomUUID(),
          deliveryZone: deliveryZone.trim(),
deliveryFee,
isExpress,
isBulky,
isCashOnDelivery,
          externalTrackingNumber: externalTrackingNumber?.trim() || null,
          sendingAgency: sendingAgency?.trim() || null,
                    agencyId: normalizedAgencyId,
          recipientName: recipientName.trim(),
          recipientPhone: recipientPhone.trim(),
          recipientAddress: recipientAddress?.trim() || null,
          deliveryInstructions: deliveryInstructions?.trim() || null,
          description: description?.trim() || null,
          conditionOnArrival: conditionOnArrival?.trim() || null,
          sealNumber: sealNumber?.trim() || null,
          registeredById: req.user!.userId,
          
          statusHistory: {
            create: {
              status: "RECEIVED",
              note: "Colis enregistrÃ© Ã  l'agence.",
              changedById: req.user!.userId,
            },
          },
        },
        include: {
          statusHistory: true,
        },
      });
      await recordAuditLog({
  userId: req.user!.userId,
  action: "PARCEL_REGISTERED",
  entity: "Parcel",
  entityId: parcel.id,
  details: `Colis enregistrÃ© avec le numÃ©ro de suivi ${parcel.trackingNumber}.`,
});

      res.status(201).json({
        success: true,
        message: "Colis enregistrÃ© avec succÃ¨s.",
        parcel,
      });
    } catch (error) {
      console.error("Ã‰chec de l'enregistrement du colis :", error);
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);

// List parcels

router.get(
  "/",
  authenticate,
  authorize("ADMIN", "COORDINATOR", "COURIER", "PARTNER"),
  async (req, res) => {
    try {
      const user = (req as AuthenticatedRequest).user!;

      if (user.role === "PARTNER" && !user.agencyId) {
        res.status(403).json({
          success: false,
          message: "Ce compte partenaire n'est associÃ© Ã  aucune agence.",
        });
        return;
      }
      const rawPage = Number(req.query.page ?? 1);
const rawLimit = Number(req.query.limit ?? 20);

if (
  !Number.isInteger(rawPage) ||
  rawPage < 1 ||
  !Number.isInteger(rawLimit) ||
  rawLimit < 1 ||
  rawLimit > 100
) {
  res.status(400).json({
    success: false,
    message: "La page doit Ãªtre positive et la limite comprise entre 1 et 100.",
  });
  return;
}

const skip = (rawPage - 1) * rawLimit;

const where =
  user.role === "COURIER"
    ? { assignedCourierId: user.userId }
    : user.role === "PARTNER"
      ? { agencyId: user.agencyId! }
      : {};

      const [parcels, total] = await prisma.$transaction([
  prisma.parcel.findMany({
    where,
    skip,
    take: rawLimit,
    orderBy: { createdAt: "desc" },
    include: {
      assignedCourier: {
        select: {
          id: true,
          fullName: true,
          phone: true,
        },
      },
    },
  }),
  prisma.parcel.count({ where }),
]);

     res.status(200).json({
  success: true,
  page: rawPage,
  limit: rawLimit,
  total,
  totalPages: Math.ceil(total / rawLimit),
  parcels,
});
    } catch (error) {
      console.error("Ã‰chec de la rÃ©cupÃ©ration des colis :", error);
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);


router.get(
  "/unclaimed/overdue",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  async (_req, res) => {
    try {
      const now = new Date();

      const parcels = await prisma.parcel.findMany({
        where: {
          unclaimedAt: { not: null },
          status: { notIn: ["DELIVERED", "RETURNED"] },
          agency: {
            is: {
              holdingPeriodDays: { not: null, gt: 0 },
            },
          },
        },
        include: {
          agency: {
            select: {
              id: true,
              name: true,
              holdingPeriodDays: true,
            },
          },
        },
        orderBy: { unclaimedAt: "asc" },
      });

      const overdueParcels = parcels
        .map((parcel) => {
          const unclaimedAt = parcel.unclaimedAt;
          const holdingPeriodDays = parcel.agency?.holdingPeriodDays;

          if (
            !unclaimedAt ||
            holdingPeriodDays == null ||
            holdingPeriodDays < 1
          ) {
            return null;
          }

          const returnEligibleAt = new Date(unclaimedAt);
          returnEligibleAt.setDate(
            returnEligibleAt.getDate() + holdingPeriodDays
          );

          if (returnEligibleAt > now) {
            return null;
          }

          return {
            ...parcel,
            returnEligibleAt,
            daysOverdue: Math.floor(
              (now.getTime() - returnEligibleAt.getTime()) /
                (1000 * 60 * 60 * 24)
            ),
          };
        })
        .filter((parcel) => parcel !== null);

      res.status(200).json({
        success: true,
        total: overdueParcels.length,
        parcels: overdueParcels,
        message:
          "Le retour de ces colis doit être traité avec une décharge signée.",
      });
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des colis non réclamés en retard :",
        error
      );
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);
router.get(
  "/unclaimed/overdue",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  async (_req, res) => {
    try {
      const now = new Date();

      const parcels = await prisma.parcel.findMany({
        where: {
          unclaimedAt: { not: null },
          status: { notIn: ["DELIVERED", "RETURNED"] },
          agency: {
            is: {
              holdingPeriodDays: { not: null, gt: 0 },
            },
          },
        },
        include: {
          agency: {
            select: {
              id: true,
              name: true,
              holdingPeriodDays: true,
            },
          },
        },
        orderBy: { unclaimedAt: "asc" },
      });

      const overdueParcels = parcels
        .map((parcel) => {
          const unclaimedAt = parcel.unclaimedAt;
          const holdingPeriodDays = parcel.agency?.holdingPeriodDays;

          if (
            !unclaimedAt ||
            holdingPeriodDays == null ||
            holdingPeriodDays < 1
          ) {
            return null;
          }

          const returnEligibleAt = new Date(unclaimedAt);
          returnEligibleAt.setDate(
            returnEligibleAt.getDate() + holdingPeriodDays
          );

          if (returnEligibleAt > now) {
            return null;
          }

          return {
            ...parcel,
            returnEligibleAt,
            daysOverdue: Math.floor(
              (now.getTime() - returnEligibleAt.getTime()) /
                (1000 * 60 * 60 * 24)
            ),
          };
        })
        .filter((parcel) => parcel !== null);

      res.status(200).json({
        success: true,
        total: overdueParcels.length,
        parcels: overdueParcels,
        message:
          "Le retour de ces colis doit être traité avec une décharge signée.",
      });
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des colis non réclamés en retard :",
        error
      );
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);
// View a parcel by internal ID
router.get(
  "/:id",
  authenticate,
  authorize("ADMIN", "COORDINATOR", "COURIER", "PARTNER"),
  async (req, res) => {
    try {
      const id = req.params.id;

      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({
          success: false,
          message: "Un identifiant de colis valide est requis.",
        });
        return;
      }

      
const user = (req as AuthenticatedRequest).user!;

const parcel = await prisma.parcel.findFirst({
  where: {
  id,
  ...(user.role === "COURIER"
    ? { assignedCourierId: user.userId }
    : {}),
  ...(user.role === "PARTNER"
    ? { agencyId: user.agencyId ?? "__NO_AGENCY__" }
    : {}),
},
  include: {
    statusHistory: {
      orderBy: { changedAt: "desc" },
    },
    photos: true,
    assignedCourier: {
      select: {
        id: true,
        fullName: true,
        phone: true,
      },
    },
    deliveryAttempts: {
  orderBy: { attemptedAt: "desc" },
},
  },
});


      if (!parcel) {
        res.status(404).json({
          success: false,
          message: "Colis introuvable.",
        });
        return;
      }

      
res.status(200).json({
  success: true,
  parcel: {
    ...parcel,
    photos: parcel.photos.map((photo) => ({
      ...photo,
      url: `/api/parcels/photos/${photo.id}/file`,
    })),
  },
});

    } catch (error) {
      console.error("Ã‰chec de la rÃ©cupÃ©ration du colis :", error);
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);

const allowedTransitions: Record<string, string[]> = {
  RECEIVED: ["REGISTERED"],
  REGISTERED: ["AWAITING_DELIVERY"],
  AWAITING_DELIVERY: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["AWAITING_DELIVERY", "RETURNED"],
  DELIVERED: [],
  RETURNED: [],
};


/**
 * Request a delivery OTP.
 * Only the assigned courier can request it.
 */
router.post(
  "/:id/delivery-otp",
  authenticate,
  authorize("COURIER"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;

      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({
          success: false,
          message: "Identifiant de colis invalide.",
        });
        return;
      }

      const parcel = await prisma.parcel.findFirst({
        where: {
          id,
          assignedCourierId: req.user!.userId,
          status: "OUT_FOR_DELIVERY",
        },
        select: {
          id: true,
          recipientPhone: true,
        },
      });

      if (!parcel) {
        res.status(404).json({
          success: false,
          message:
            "Colis introuvable, non attribuÃ© Ã  ce coursier ou non en cours de livraison.",
        });
        return;
      }

      const now = new Date();

      // Expire previous unverified OTPs for this parcel.
      await prisma.deliveryOtp.updateMany({
        where: {
          parcelId: parcel.id,
          verifiedAt: null,
          expiresAt: { gt: now },
        },
        data: { expiresAt: now },
      });

      const code = generateDeliveryOtp();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

      const otp = await prisma.deliveryOtp.create({
        data: {
          parcelId: parcel.id,
          codeHash: hashDeliveryOtp(code),
          expiresAt,
        },
      });

      const smsMessage =
        `NEXORA EXPRESS : votre code de confirmation de livraison est ${code}. ` +
        "Il expire dans 5 minutes. Ne le partagez qu'au moment de la remise du colis.";

      try {
        await sendZomloaSms(parcel.recipientPhone, smsMessage);
      } catch {
        await prisma.deliveryOtp.update({
          where: { id: otp.id },
          data: { expiresAt: new Date() },
        });

        res.status(502).json({
          success: false,
          message:
            "Le SMS n'a pas pu Ãªtre soumis. VÃ©rifiez le numÃ©ro ou rÃ©essayez.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Code soumis Ã  Zomloa pour envoi au destinataire.",
        expiresAt,
      });
    } catch (error) {
      console.error("Erreur lors de la demande du code de livraison.");
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  },
);

/**
 * Verify a delivery OTP.
 * Only the assigned courier can verify it.
 */
router.post(
  "/:id/verify-delivery-otp",
  authenticate,
  authorize("COURIER"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
      const { code } = req.body as { code?: string };

      if (
        typeof id !== "string" ||
        !id.trim() ||
        typeof code !== "string" ||
        !/^\d{6}$/.test(code)
      ) {
        res.status(400).json({
          success: false,
          message: "Identifiant de colis ou code Ã  six chiffres invalide.",
        });
        return;
      }

      const parcel = await prisma.parcel.findFirst({
        where: {
          id,
          assignedCourierId: req.user!.userId,
          status: "OUT_FOR_DELIVERY",
        },
        select: { id: true },
      });

      if (!parcel) {
        res.status(404).json({
          success: false,
          message:
            "Colis introuvable, non attribuÃ© Ã  ce coursier ou non en cours de livraison.",
        });
        return;
      }

      const now = new Date();

      const otp = await prisma.deliveryOtp.findFirst({
        where: {
          parcelId: parcel.id,
          verifiedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: 5 },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!otp) {
        res.status(400).json({
          success: false,
          message: "Aucun code valide. Demandez un nouveau code.",
        });
        return;
      }

      if (!verifyDeliveryOtp(code, otp.codeHash)) {
        const attempts = otp.attempts + 1;

        await prisma.deliveryOtp.update({
          where: { id: otp.id },
          data: {
            attempts,
            ...(attempts >= 5 ? { expiresAt: now } : {}),
          },
        });

        res.status(400).json({
          success: false,
          message:
            attempts >= 5
              ? "Nombre maximal de tentatives atteint. Demandez un nouveau code."
              : "Code incorrect.",
          attemptsRemaining: Math.max(0, 5 - attempts),
        });
        return;
      }

      await prisma.deliveryOtp.update({
        where: { id: otp.id },
        data: { verifiedAt: now },
      });

      res.status(200).json({
        success: true,
        message: "Code vÃ©rifiÃ©. Vous pouvez confirmer la livraison.",
      });
    } catch {
      console.error("Erreur lors de la vÃ©rification du code de livraison.");
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  },
);


// Update parcel status
router.patch(
  "/:id/status",
  authenticate,
  authorize("ADMIN", "COORDINATOR", "COURIER"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
 const {
  status,
  note,
  deliveredToName,
  deliveryProofNote,
} = req.body as {
  status?: string;
  note?: string;
  deliveredToName?: string;
  deliveryProofNote?: string;
};

      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({
          success: false,
          message: "Un identifiant de colis valide est requis.",
        });
        return;
      }

      const validStatuses = [
        "RECEIVED",
        "REGISTERED",
        "AWAITING_DELIVERY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "DELIVERY_FAILED",
        "RETURNED",
      ];

      if (typeof status !== "string" || !validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          message: "Le statut du colis est invalide.",
        });
        return;
      }

      if (note !== undefined && typeof note !== "string") {
        res.status(400).json({
          success: false,
          message: "La note doit Ãªtre une chaÃ®ne de caractÃ¨res.",
        });
        return;
      }

      if (
  deliveredToName !== undefined &&
  typeof deliveredToName !== "string"
) {
  res.status(400).json({
    success: false,
    message: "Le nom du rÃ©ceptionnaire doit Ãªtre une chaÃ®ne de caractÃ¨res.",
  });
  return;
}

if (
  deliveryProofNote !== undefined &&
  typeof deliveryProofNote !== "string"
) {
  res.status(400).json({
    success: false,
    message: "La confirmation de livraison doit Ãªtre une chaÃ®ne de caractÃ¨res.",
  });
  return;
}

if (status === "DELIVERED" && !deliveredToName?.trim()) {
  res.status(400).json({
    success: false,
    message: "Le nom de la personne ayant reÃ§u le colis est obligatoire pour confirmer la livraison.",
  });
  return;
}

const parcel = await prisma.parcel.findFirst({
  where: {
    id,
    ...(req.user!.role === "COURIER"
      ? { assignedCourierId: req.user!.userId }
      : {}),
  },
});


      if (!parcel) {
        res.status(404).json({
          success: false,
          message: "Colis introuvable.",
        });
        return;
      }
      
const isCourier = req.user!.role === "COURIER";

const courierAllowedStatuses = [
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
];

if (isCourier && !courierAllowedStatuses.includes(status)) {
  res.status(403).json({
    success: false,
    message: "Vous n'Ãªtes pas autorisÃ© Ã  appliquer ce statut.",
  });
  return;
}

if (status === "DELIVERED") {
  const now = new Date();

  
const latestOtp = await prisma.deliveryOtp.findFirst({
  where: {
    parcelId: parcel.id,
  },
  orderBy: { createdAt: "desc" },
});

if (
  !latestOtp ||
  !latestOtp.verifiedAt ||
  latestOtp.expiresAt <= now
) {
  res.status(400).json({
    success: false,
    message:
      "La livraison ne peut pas Ãªtre confirmÃ©e sans vÃ©rification prÃ©alable du dernier code OTP.",
  });
  return;
}
}


      if (!allowedTransitions[parcel.status].includes(status)) {
        res.status(400).json({
          success: false,
          message: "Cette transition de statut n'est pas autorisÃ©e.",
        });
        return;
      }

      if (status === "OUT_FOR_DELIVERY" && !parcel.recipientConfirmedAt) {
  res.status(400).json({
    success: false,
    message:
      "Le destinataire doit confirmer son adresse et ses préférences de livraison avant le départ du colis.",
  });
  return;
}
      

    
const updatedParcel = await prisma.$transaction(async (tx) => {
  const updateResult = await tx.parcel.updateMany({
    where: {
      id,
      status: parcel.status,
      ...(isCourier ? { assignedCourierId: req.user!.userId } : {}),
    },
    data: {
      status: status as
        | "RECEIVED"
        | "REGISTERED"
        | "AWAITING_DELIVERY"
        | "OUT_FOR_DELIVERY"
        | "DELIVERED"
        | "DELIVERY_FAILED"
        | "RETURNED",
      ...(status === "DELIVERED"
        ? {
            deliveredAt: new Date(),
            deliveredToName: deliveredToName!.trim(),
            deliveryProofNote: deliveryProofNote?.trim() || null,
          }
        : {}),
    },
  });

  if (updateResult.count === 0) {
    return null;
  }

  const updated = await tx.parcel.findUniqueOrThrow({
    where: { id },
  });

  await tx.parcelStatusHistory.create({
    data: {
      parcelId: id,
      status: status as
        | "RECEIVED"
        | "REGISTERED"
        | "AWAITING_DELIVERY"
        | "OUT_FOR_DELIVERY"
        | "DELIVERED"
        | "DELIVERY_FAILED"
        | "RETURNED",
      note: note?.trim() || null,
      changedById: req.user!.userId,
    },
  });
    if (status === "DELIVERY_FAILED") {
    const attemptNumber =
      (await tx.deliveryAttempt.count({
        where: { parcelId: id },
      })) + 1;

    await tx.deliveryAttempt.create({
      data: {
        parcelId: id,
        courierId: parcel.assignedCourierId,
        attemptNumber,
        outcome: "FAILED",
        failureReason: note?.trim() || null,
        notes: note?.trim() || null,
      },
    });
  }

  await tx.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "PARCEL_STATUS_UPDATED",
      entity: "Parcel",
      entityId: id,
      details: `Statut changÃ© de ${parcel.status} Ã  ${status}.${
        note?.trim() ? ` Note : ${note.trim()}` : ""
      }`,
    },
  });

  return updated;
});

if (!updatedParcel) {
  res.status(409).json({
    success: false,
    message:
      "Le statut du colis a changÃ© entre-temps. Rechargez les informations avant de rÃ©essayer.",
  });
  return;
}

      res.status(200).json({
        success: true,
        message: "Statut du colis mis Ã  jour avec succÃ¨s.",
        parcel: updatedParcel,
      });
    } catch (error) {
      console.error("Ã‰chec de la mise Ã  jour du statut du colis :", error);
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);

router.patch(
  "/:id/assign",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  async (req, res) => {
    try {
      const id = req.params.id;
      const { courierId } = req.body as { courierId?: string };

      if (
        typeof id !== "string" ||
        !id.trim() ||
        typeof courierId !== "string" ||
        !courierId.trim()
      ) {
        res.status(400).json({
          success: false,
          message: "Un identifiant de colis et un identifiant de livreur sont requis.",
        });
        return;
      }

      
const parcel = await prisma.parcel.findUnique({
  where: { id },
  select: {
    id: true,
    status: true,
    assignedCourierId: true,
  },
});


      if (!parcel) {
        res.status(404).json({
          success: false,
          message: "Colis introuvable.",
        });
        return;
      }

      if (
        parcel.status !== "AWAITING_DELIVERY" &&
        parcel.status !== "DELIVERY_FAILED"
      ) {
        res.status(400).json({
          success: false,
          message: "Ce colis ne peut pas Ãªtre affectÃ© Ã  un livreur dans son statut actuel.",
        });
        return;
      }
      
if (parcel.assignedCourierId === courierId) {
  res.status(400).json({
    success: false,
    message: "Ce colis est dÃ©jÃ  affectÃ© Ã  ce livreur.",
  });
  return;
}


      const courier = await prisma.user.findUnique({
        where: { id: courierId },
        select: {
          id: true,
          fullName: true,
          role: true,
          isActive: true,
        },
      });

      if (!courier || courier.role !== "COURIER" || !courier.isActive) {
        res.status(400).json({
          success: false,
          message: "Le livreur est introuvable, inactif ou ne possÃ¨de pas le rÃ´le requis.",
        });
        return;
      }

      
const updatedParcel = await prisma.$transaction(async (tx) => {
  const updated = await tx.parcel.update({
    where: { id },
    data: { assignedCourierId: courierId },
    include: {
      assignedCourier: {
        select: {
          id: true,
          fullName: true,
          phone: true,
        },
      },
    },
  });

  await tx.parcelStatusHistory.create({
    data: {
      parcelId: id,
      status: parcel.status,
      note: `Livreur affectÃ© : ${courier.fullName}.`,
      changedById: (req as AuthenticatedRequest).user!.userId,
    },
  });
await tx.auditLog.create({
  data: {
    userId: (req as AuthenticatedRequest).user!.userId,
    action: "COURIER_ASSIGNED",
    entity: "Parcel",
    entityId: id,
    details: `Livreur affectÃ© : ${courier.fullName}.`,
  },
});
  return updated;
});

      res.status(200).json({
        success: true,
        message: "Livreur affectÃ© au colis avec succÃ¨s.",
        parcel: updatedParcel,
      });
    } catch (error) {
      console.error("Ã‰chec de l'affectation du livreur :", error);
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);
router.patch(
  "/:id/delivery-resolution",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
      const { recipientChoice, relayPointDetails } = req.body as {
        recipientChoice?: string;
        relayPointDetails?: string;
      };

      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({
          success: false,
          message: "Un identifiant de colis valide est requis.",
        });
        return;
      }

      if (
        recipientChoice !== "RELAY_POINT" &&
        recipientChoice !== "RETURN_TO_AGENCY"
      ) {
        res.status(400).json({
          success: false,
          message: "Le choix doit Ãªtre RELAY_POINT ou RETURN_TO_AGENCY.",
        });
        return;
      }

      if (
        relayPointDetails !== undefined &&
        typeof relayPointDetails !== "string"
      ) {
        res.status(400).json({
          success: false,
          message: "Les dÃ©tails du point relais doivent Ãªtre du texte.",
        });
        return;
      }

      if (
        recipientChoice === "RELAY_POINT" &&
        !relayPointDetails?.trim()
      ) {
        res.status(400).json({
          success: false,
          message: "Les dÃ©tails du point relais sont obligatoires.",
        });
        return;
      }

      const userId = req.user!.userId;

      const result = await prisma.$transaction(async (tx) => {
        const parcel = await tx.parcel.findUnique({
  where: { id },
  select: {
    id: true,
    status: true,
    deliveryZone: true,
    deliveryFee: true,
    isSecondPresentation: true,
    isExpress: true,
    isBulky: true,
    isCashOnDelivery: true,
  },
});

        if (!parcel) {
          return { error: "NOT_FOUND" as const };
        }

        if (parcel.status !== "DELIVERY_FAILED") {
          return { error: "INVALID_STATUS" as const };
        }

        const attempts = await tx.deliveryAttempt.findMany({
          where: { parcelId: id },
          orderBy: { attemptNumber: "desc" },
        });

        if (attempts.length < 2) {
          return { error: "NOT_ENOUGH_ATTEMPTS" as const };
        }

        const latestAttempt = attempts[0];

        if (latestAttempt.recipientChoice || latestAttempt.resolvedAt) {
          return { error: "ALREADY_RESOLVED" as const };
        }

       const newStatus =
  recipientChoice === "RETURN_TO_AGENCY"
    ? "DELIVERY_FAILED"
    : "AWAITING_DELIVERY";
    let updatedDeliveryFee = parcel.deliveryFee;

if (
  recipientChoice === "RELAY_POINT" &&
  !parcel.isSecondPresentation
) {
  if (!parcel.deliveryZone || parcel.deliveryFee === null) {
    return { error: "PRICING_NOT_FOUND" as const };
  }

  const pricingRule = await tx.pricingRule.findFirst({
    where: {
      zone: parcel.deliveryZone,
      isActive: true,
    },
  });

  if (!pricingRule) {
    return { error: "PRICING_NOT_FOUND" as const };
  }

  updatedDeliveryFee =
    parcel.deliveryFee + pricingRule.secondPresentationSurcharge;
}

        const updated = await tx.parcel.updateMany({
          where: { id, status: "DELIVERY_FAILED" },
          data: {
  status: newStatus,
  ...(recipientChoice === "RELAY_POINT" &&
  !parcel.isSecondPresentation
    ? {
        deliveryFee: updatedDeliveryFee,
        isSecondPresentation: true,
      }
    : {}),
},
        });

        if (updated.count === 0) {
          return { error: "CONFLICT" as const };
        }

        const resolvedAttempt = await tx.deliveryAttempt.update({
          where: { id: latestAttempt.id },
          data: {
            recipientChoice,
            relayPointDetails:
              recipientChoice === "RELAY_POINT"
                ? relayPointDetails!.trim()
                : null,
            resolvedAt: new Date(),
          },
        });

        await tx.parcelStatusHistory.create({
          data: {
            parcelId: id,
            status: newStatus,
            note:
              recipientChoice === "RELAY_POINT"
                ? `Orientation vers un point relais : ${relayPointDetails!.trim()}`
                : "Retour Ã  l'agence choisi aprÃ¨s deux Ã©checs de livraison.",
            changedById: userId,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: "DELIVERY_FAILURE_RESOLVED",
            entity: "Parcel",
            entityId: id,
            details: `Choix du destinataire : ${recipientChoice}.`,
          },
        });

        return { resolvedAttempt, newStatus };
      });

      if ("error" in result) {
        const responses = {
          NOT_FOUND: [404, "Colis introuvable."],
          INVALID_STATUS: [400, "Le colis doit Ãªtre en Ã©chec de livraison."],
          NOT_ENOUGH_ATTEMPTS: [
            400,
            "Deux tentatives Ã©chouÃ©es sont requises.",
          ],
          ALREADY_RESOLVED: [
            409,
            "La derniÃ¨re tentative a dÃ©jÃ  Ã©tÃ© traitÃ©e.",
          ],
          CONFLICT: [
            409,
            "Le statut du colis a changÃ©. Rechargez les informations.",
          ],
        } as const;

        const [statusCode, message] =
  responses[result.error as keyof typeof responses];

        res.status(statusCode).json({
          success: false,
          message,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "La dÃ©cision aprÃ¨s Ã©chec de livraison a Ã©tÃ© enregistrÃ©e.",
        status: result.newStatus,
        deliveryAttempt: result.resolvedAttempt,
      });
    } catch (error) {
      console.error("Erreur lors de la rÃ©solution d'un Ã©chec de livraison :", error);
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);


/**
 * Ajouter une rÃ©fÃ©rence photo Ã  un colis.
 * L'image doit dÃ©jÃ  Ãªtre accessible via une URL.
 */

router.patch(
  "/:id/unclaimed",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
      const userId = req.user!.userId;

      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({
          success: false,
          message: "Un identifiant de colis valide est requis.",
        });
        return;
      }

      const parcel = await prisma.parcel.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          unclaimedAt: true,
          agency: { select: { holdingPeriodDays: true } },
        },
      });

      if (!parcel) {
        res.status(404).json({
          success: false,
          message: "Colis introuvable.",
        });
        return;
      }

      if (
        !["RECEIVED", "REGISTERED", "AWAITING_DELIVERY", "DELIVERY_FAILED"]
          .includes(parcel.status)
      ) {
        res.status(400).json({
          success: false,
          message: "Ce colis ne peut pas être marqué comme non réclamé dans son statut actuel.",
        });
        return;
      }

      if (parcel.unclaimedAt) {
        res.status(409).json({
          success: false,
          message: "Ce colis est déjà marqué comme non réclamé.",
          unclaimedAt: parcel.unclaimedAt,
        });
        return;
      }

      const holdingPeriodDays = parcel.agency?.holdingPeriodDays;

      if (
        holdingPeriodDays == null ||
        !Number.isInteger(holdingPeriodDays) ||
        holdingPeriodDays < 1
      ) {
        res.status(400).json({
          success: false,
          message: "Configurez d'abord une durée de conservation valide pour l'agence du colis.",
        });
        return;
      }

      const now = new Date();
      const returnEligibleAt = new Date(now);
      returnEligibleAt.setDate(
        returnEligibleAt.getDate() + holdingPeriodDays
      );

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.parcel.updateMany({
          where: {
            id,
            unclaimedAt: null,
            status: parcel.status,
          },
          data: { unclaimedAt: now },
        });

        if (updated.count !== 1) {
          return false;
        }

        await tx.auditLog.create({
          data: {
            userId,
            action: "PARCEL_MARKED_UNCLAIMED",
            entity: "Parcel",
            entityId: id,
            details: `Colis marqué non réclamé. Durée de conservation : ${holdingPeriodDays} jour(s).`,
          },
        });

        return true;
      });

      if (!result) {
        res.status(409).json({
          success: false,
          message: "Le colis a été modifié entre-temps. Rechargez ses informations.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Colis marqué comme non réclamé.",
        unclaimedAt: now,
        returnEligibleAt,
        holdingPeriodDays,
        note: "Le retour à l'agence nécessite toujours une décharge signée.",
      });
    } catch (error) {
      console.error("Erreur lors du marquage du colis comme non réclamé :", error);
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);
router.post(
  "/:id/photos",
  authenticate,
  authorize("ADMIN", "COORDINATOR", "COURIER"),
  async (req, res) => {
    try {
      const id = req.params.id;
      const user = (req as AuthenticatedRequest).user!;
      const { url, purpose } = req.body as {
        url?: string;
        purpose?: string;
      };

      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({
          success: false,
          message: "L'identifiant du colis est requis.",
        });
        return;
      }

      if (typeof url !== "string" || !url.trim()) {
        res.status(400).json({
          success: false,
          message: "L'URL de la photo est requise.",
        });
        return;
      }

      let parsedUrl: URL;

      try {
        parsedUrl = new URL(url.trim());
      } catch {
        res.status(400).json({
          success: false,
          message: "L'URL de la photo est invalide.",
        });
        return;
      }

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        res.status(400).json({
          success: false,
          message: "L'URL doit utiliser HTTP ou HTTPS.",
        });
        return;
      }

      if (purpose !== undefined && typeof purpose !== "string") {
        res.status(400).json({
          success: false,
          message: "Le type de photo est invalide.",
        });
        return;
      }
      if (purpose?.trim() === "DELIVERY_PROOF") {
  res.status(400).json({
    success: false,
    message:
      "La preuve de livraison doit Ãªtre ajoutÃ©e via le tÃ©lÃ©versement d'une photo.",
  });
  return;
}

      const parcel = await prisma.parcel.findFirst({
        where: {
          id,
          ...(user.role === "COURIER"
            ? { assignedCourierId: user.userId }
            : {}),
        },
        select: { id: true },
      });

      if (!parcel) {
        res.status(404).json({
          success: false,
          message: "Colis introuvable.",
        });
        return;
      }

      const photo = await prisma.parcelPhoto.create({
  data: {
    parcelId: id,
    url: parsedUrl.toString(),
    purpose: purpose?.trim() || null,
  },
});

      if (photo.purpose !== "RETURN_DISCHARGE") {
  await recordAuditLog({
    userId: user.userId,
    action: "PARCEL_PHOTO_UPLOADED",
    entity: "Parcel",
    entityId: id,
    details: `Photo tÃ©lÃ©versÃ©e pour le colis ${id}.`,
  });
}

      res.status(201).json({
        success: true,
        message: "RÃ©fÃ©rence de la photo enregistrÃ©e avec succÃ¨s.",
        photo,
      });
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la photo :", error);
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);



router.post(
  "/:id/photos/upload",
  authenticate,
  authorize("ADMIN", "COORDINATOR", "COURIER"),
  async (req, res) => {
    const id = req.params.id;
    const user = (req as AuthenticatedRequest).user!;

    try {
      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({
          success: false,
          message: "L'identifiant du colis est requis.",
        });
        return;
      }

      const parcel = await prisma.parcel.findFirst({
        where: {
          id,
          ...(user.role === "COURIER"
            ? { assignedCourierId: user.userId }
            : {}),
        },
        
        select: { id: true },
      });
      

      if (!parcel) {
        res.status(404).json({
          success: false,
          message: "Colis introuvable ou accÃ¨s non autorisÃ©.",
        });
        return;
      }

      parcelPhotoUpload.single("photo")(req, res, async (error) => {
        if (error) {
          res.status(400).json({
            success: false,
            message: error.message || "Ã‰chec du tÃ©lÃ©versement de la photo.",
          });
          return;
        }

        try {
          if (!req.file) {
            res.status(400).json({
              success: false,
              message: "Veuillez sÃ©lectionner une photo.",
            });
            return;
          }
          
const isValidImage = await validateUploadedPhoto(req.file.path);

if (!isValidImage) {
  await fs.unlink(req.file.path);

  res.status(400).json({
    success: false,
    message: "Le contenu du fichier n'est pas une image JPEG, PNG ou WebP valide.",
  });
  return;
}


         
const uploadedFile = req.file;
const photoUrl = `/uploads/parcels/${path.basename(uploadedFile.filename)}`;
const purpose =
  req.body?.purpose === "RETURN_DISCHARGE"
    ? "RETURN_DISCHARGE"
    : "DELIVERY_PROOF";

if (
  purpose === "RETURN_DISCHARGE" &&
  user.role !== "ADMIN" &&
  user.role !== "COORDINATOR"
) {
  await fs.unlink(uploadedFile.path);
  res.status(403).json({
    success: false,
    message: "Seuls un administrateur ou un coordinateur peuvent enregistrer une décharge de retour.",
  });
  return;
}

const result = await prisma.$transaction(async (tx) => {
  if (purpose === "RETURN_DISCHARGE") {
  const parcel = await tx.parcel.findUnique({
    where: { id },
    select: {
      status: true,
      unclaimedAt: true,
      agency: {
        select: {
          holdingPeriodDays: true,
        },
      },
    },
  });

  if (!parcel) {
    return { error: "INVALID_STATUS" as const };
  }

  const attempt = await tx.deliveryAttempt.findFirst({
    where: { parcelId: id },
    orderBy: { attemptNumber: "desc" },
    select: { recipientChoice: true },
  });

  const isFailedDeliveryReturn =
    parcel.status === "DELIVERY_FAILED" &&
    attempt?.recipientChoice === "RETURN_TO_AGENCY";

 const holdingPeriodDays = parcel.agency?.holdingPeriodDays ?? null;

  const returnEligibleAt =
    parcel.unclaimedAt && holdingPeriodDays != null && holdingPeriodDays >= 1
      ? new Date(
          parcel.unclaimedAt.getTime() +
            holdingPeriodDays * 24 * 60 * 60 * 1000,
        )
      : null;

  const isExpiredUnclaimed =
    parcel.unclaimedAt !== null &&
    returnEligibleAt !== null &&
    returnEligibleAt <= new Date() &&
    parcel.status !== "DELIVERED" &&
    parcel.status !== "RETURNED";

  if (!isFailedDeliveryReturn && !isExpiredUnclaimed) {
    return { error: "INVALID_RETURN" as const };
  }

  const updated = await tx.parcel.updateMany({
    where: {
      id,
      status: parcel.status,
    },
    data: { status: "RETURNED" },
  });

  if (updated.count !== 1) {
    return { error: "INVALID_STATUS" as const };
  }

  const photo = await tx.parcelPhoto.create({
    data: { parcelId: id, url: photoUrl, purpose },
  });

  await tx.parcelStatusHistory.create({
    data: {
      parcelId: id,
      status: "RETURNED",
      note: isFailedDeliveryReturn
        ? "Retour à l'agence enregistré avec preuve de décharge signée."
        : "Retour du colis non réclamé après expiration du délai de garde, avec preuve de décharge signée.",
      changedById: user.userId,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: user.userId,
      action: "PARCEL_RETURNED_TO_AGENCY",
      entity: "Parcel",
      entityId: id,
      details: isFailedDeliveryReturn
        ? "Preuve de décharge signée enregistrée après échec de livraison."
        : "Preuve de décharge signée enregistrée après expiration du délai de garde.",
    },
  });

  return { photo };
}
  const photo = await tx.parcelPhoto.create({
    data: { parcelId: id, url: photoUrl, purpose },
  });

  return { photo };
});

if ("error" in result) {
  await fs.unlink(uploadedFile.path);
  res.status(result.error === "INVALID_RETURN" ? 400 : 409).json({
    success: false,
    message:
      result.error === "INVALID_RETURN"
        ? "Le choix de retour à l'agence doit être enregistré avant la décharge."
        : "Le colis n'est pas en attente de retour. Vérifiez son statut.",
  });
  return;
}

const photo = result.photo;

if (purpose === "DELIVERY_PROOF") {
  await recordAuditLog({
    userId: user.userId,
    action: "PARCEL_PHOTO_UPLOADED",
    entity: "Parcel",
    entityId: id,
    details: `Photo téléversée pour le colis ${id}.`,
  });
}

res.status(201).json({
  success: true,
  message:
    purpose === "RETURN_DISCHARGE"
      ? "Décharge de retour enregistrée avec succès."
      : "Photo téléversée avec succès.",
  photo: {
    ...photo,
    url: `/api/parcels/photos/${photo.id}/file`,
  },
});

        
} catch (uploadError) {
  if (req.file?.path) {
    try {
      await fs.unlink(req.file.path);
    } catch (cleanupError) {
      console.error(
        "Erreur lors de la suppression du fichier temporaire :",
        cleanupError
      );
    }
  }

  console.error("Erreur lors du tÃ©lÃ©versement :", uploadError);

  res.status(500).json({
    success: false,
    message: "Une erreur inattendue est survenue.",
  });
}

      });
    } catch (error) {
      console.error("Erreur lors de la vÃ©rification du colis :", error);
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);



/**
 * Consulter les photos associÃ©es Ã  un colis.
 */
router.get(
  "/:id/photos",
  authenticate,
  authorize("ADMIN", "COORDINATOR", "COURIER"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id;
      const user = req.user!;

      if (typeof id !== "string" || !id.trim()) {
        res.status(400).json({
          success: false,
          message: "L'identifiant du colis est requis.",
        });
        return;
      }

      const parcel = await prisma.parcel.findFirst({
        where: {
          id,
          ...(user.role === "COURIER"
            ? { assignedCourierId: user.userId }
            : {}),
        },
        select: { id: true },
      });

      if (!parcel) {
        res.status(404).json({
          success: false,
          message: "Colis introuvable.",
        });
        return;
      }

      const photos = await prisma.parcelPhoto.findMany({
        where: { parcelId: id },
        orderBy: { createdAt: "desc" },
      });

      res.status(200).json({
        success: true,
        photos: photos.map((photo) => ({
          ...photo,
          url: `/api/parcels/photos/${photo.id}/file`,
        })),
      });
    } catch (error) {
      console.error(
        "Erreur lors de la rÃ©cupÃ©ration des photos :",
        error
      );
      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);


/**
 * Rechercher un colis par son numÃ©ro de suivi NEXORA EXPRESS.
 */
router.get(
  "/tracking/:trackingNumber",
  async (req, res) => {
    try {
      const trackingNumber = req.params.trackingNumber;

      if (
        typeof trackingNumber !== "string" ||
        !trackingNumber.trim()
      ) {
        res.status(400).json({
          success: false,
          message: "Le numÃ©ro de suivi est requis.",
        });
        return;
      }

      const parcel = await prisma.parcel.findUnique({
        where: {
          trackingNumber: trackingNumber.trim(),
        },
        select: {
          trackingNumber: true,
          status: true,
          receivedAt: true,
          deliveredAt: true,
          createdAt: true,
          statusHistory: {
            orderBy: { changedAt: "asc" },
            select: {
              status: true,
              changedAt: true,
            },
          },
        },
      });

      if (!parcel) {
        res.status(404).json({
          success: false,
          message: "Aucun colis ne correspond Ã  ce numÃ©ro de suivi.",
        });
        return;
      }

      res.setHeader("Cache-Control", "no-store");

      res.status(200).json({
        success: true,
        tracking: parcel,
      });
    } catch (error) {
      console.error(
        "Erreur lors du suivi public du colis :",
        error
      );

      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);
router.get(
  "/photos/:photoId/file",
  authenticate,
  authorize("ADMIN", "COORDINATOR", "COURIER"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const photoId = req.params.photoId;
      const user = req.user!;

      if (typeof photoId !== "string" || !photoId.trim()) {
        res.status(400).json({
          success: false,
          message: "L'identifiant de la photo est requis.",
        });
        return;
      }

      const photo = await prisma.parcelPhoto.findFirst({
        where: {
          id: photoId,
          url: { startsWith: "/uploads/parcels/" },
          parcel:
            user.role === "COURIER"
              ? { assignedCourierId: user.userId }
              : {},
        },
        
        select: {
          url: true,
        },
      });

      if (!photo) {
        res.status(404).json({
          success: false,
          message: "Photo introuvable ou accÃ¨s non autorisÃ©.",
        });
        return;
      }

      const filename = path.basename(photo.url);
      const filePath = path.resolve("uploads", "parcels", filename);
      const file = await fs.readFile(filePath);

      const extension = path.extname(filename).toLowerCase();
      const contentTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
      };

      const contentType = contentTypes[extension];

      if (!contentType) {
        res.status(404).json({
          success: false,
          message: "Format de photo non pris en charge.",
        });
        return;
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(file);
    } catch (error) {
      console.error("Erreur lors de l'accÃ¨s Ã  la photo :", error);

      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({
          success: false,
          message: "Fichier photo introuvable.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Une erreur inattendue est survenue.",
      });
    }
  }
);


export default router;
