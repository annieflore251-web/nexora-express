
import { Router, type Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../auth/authenticate.js";
import { authorize } from "../auth/authorize.js";
import { recordAuditLog } from "../lib/audit.js";

const router = Router();

router.use(authenticate, authorize("ADMIN", "COORDINATOR"));


function handleError(error: unknown, res: Response) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return res.status(409).json({
      success: false,
      message: "Ce code ou cette information unique existe déjà.",
    });
  }

  console.error("Agency API error:", error);

  return res.status(500).json({
    success: false,
    message: "Une erreur inattendue s'est produite.",
  });
}

// Create an agency
router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const {
  name,
  code,
  city,
  address,
  phone,
  email,
  holdingPeriodDays,
} = req.body;
if (
  holdingPeriodDays !== undefined &&
  holdingPeriodDays !== null &&
  (!Number.isInteger(holdingPeriodDays) || holdingPeriodDays < 1)
) {
  return res.status(400).json({
    success: false,
    message:
      "Le délai de conservation doit être un nombre entier supérieur ou égal à 1 jour.",
  });
}
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof code !== "string" ||
      !code.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Le nom et le code de l'agence sont obligatoires.",
      });
    }

    const agency = await prisma.agency.create({
      data: {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        holdingPeriodDays: holdingPeriodDays ?? null,
        city: typeof city === "string" && city.trim() ? city.trim() : null,
        address:
          typeof address === "string" && address.trim()
            ? address.trim()
            : null,
        phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
        email:
          typeof email === "string" && email.trim()
            ? email.trim().toLowerCase()
            : null,
      },
    });
    await recordAuditLog({
  userId: req.user?.userId,
  action: "AGENCY_CREATED",
  entity: "Agency",
  entityId: agency.id,
  details: `Agence créée : ${agency.name} (${agency.code})`,
});

    return res.status(201).json({
      success: true,
      message: "Agence créée avec succès.",
      agency,
    });
  } catch (error) {
    return handleError(error, res);
  }
});

// List agencies with optional search and active-status filter
router.get("/", async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    const activeParam = req.query.active;
    let isActive: boolean | undefined;

    if (activeParam === "true") isActive = true;
    else if (activeParam === "false") isActive = false;
    else if (activeParam !== undefined) {
      return res.status(400).json({
        success: false,
        message: "Le filtre active doit être true ou false.",
      });
    }

    const agencies = await prisma.agency.findMany({
      where: {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { city: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      include: { _count: { select: { parcels: true } } },
    });

    return res.status(200).json({
      success: true,
      count: agencies.length,
      agencies,
    });
  } catch (error) {
    return handleError(error, res);
  }
});

// View one agency and its most recent parcels
router.get("/:id", async (req, res) => {
  try {
    const agency = await prisma.agency.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { parcels: true } },
        parcels: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            trackingNumber: true,
            recipientName: true,
            recipientPhone: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!agency) {
      return res.status(404).json({
        success: false,
        message: "Agence introuvable.",
      });
    }

    return res.status(200).json({ success: true, agency });
  } catch (error) {
    return handleError(error, res);
  }
});

// Update an agency
router.patch("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = req.params.id;

if (typeof id !== "string" || !id.trim()) {
  return res.status(400).json({
    success: false,
    message: "Un identifiant d'agence valide est requis.",
  });
}
    const {
  name,
  code,
  city,
  address,
  phone,
  email,
  isActive,
  holdingPeriodDays,
} = req.body;
    const data: Prisma.AgencyUpdateInput = {};
    if (holdingPeriodDays !== undefined) {
  if (
    holdingPeriodDays !== null &&
    (!Number.isInteger(holdingPeriodDays) || holdingPeriodDays < 1)
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Le délai de conservation doit être un nombre entier supérieur ou égal à 1 jour, ou null.",
    });
  }

  data.holdingPeriodDays = holdingPeriodDays;
}

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Le nom doit être un texte non vide.",
        });
      }
      data.name = name.trim();
    }

    if (code !== undefined) {
      if (typeof code !== "string" || !code.trim()) {
        return res.status(400).json({
          success: false,
          message: "Le code doit être un texte non vide.",
        });
      }
      data.code = code.trim().toUpperCase();
    }

    for (const field of ["city", "address", "phone", "email"] as const) {
      if (req.body[field] !== undefined) {
        const value = req.body[field];

        if (value !== null && typeof value !== "string") {
          return res.status(400).json({
            success: false,
            message: `${field} doit être un texte ou null.`,
          });
        }

        const normalized =
          typeof value === "string" ? value.trim() || null : null;

        if (field === "city") data.city = normalized;
        if (field === "address") data.address = normalized;
        if (field === "phone") data.phone = normalized;
        if (field === "email") {
          data.email = normalized ? normalized.toLowerCase() : null;
        }
      }
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isActive doit être un booléen.",
        });
      }
      data.isActive = isActive;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Aucune information valide à modifier.",
      });
    }

    const agency = await prisma.agency.update({
      where: { id },
      data,
    });
await recordAuditLog({
  userId: req.user?.userId,
  action: "AGENCY_UPDATED",
  entity: "Agency",
  entityId: agency.id,
  details: `Informations de l'agence mises à jour : ${agency.name} (${agency.code})`,
});
    return res.status(200).json({
      success: true,
      message: "Agence mise à jour avec succès.",
      agency,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.status(404).json({
        success: false,
        message: "Agence introuvable.",
      });
    }

    return handleError(error, res);
  }
});

export default router;
