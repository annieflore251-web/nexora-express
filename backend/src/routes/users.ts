import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../auth/password.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../auth/authenticate.js";
import { authorize } from "../auth/authorize.js";
import { recordAuditLog } from "../lib/audit.js";

const router = Router();

const validRoles = ["ADMIN", "COORDINATOR", "COURIER", "PARTNER"] as const;

router.get("/", authenticate, authorize("ADMIN"), async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        agencyId: true,
partnerAgency: {
  select: {
    id: true,
    name: true,
    code: true,
  },
},
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Échec de la récupération du personnel :", error);
    res.status(500).json({
      success: false,
      message: "Une erreur inattendue est survenue.",
    });
  }
});

router.patch(
  "/:id/status",
  authenticate,
  authorize("ADMIN"),
  async (req: AuthenticatedRequest, res) => {
  try {
   const id = req.params.id;

if (typeof id !== "string" || !id.trim()) {
  res.status(400).json({
    success: false,
    message: "Un identifiant d'employé valide est requis.",
  });
  return;
}
    const { isActive } = req.body as { isActive?: boolean };
    

    if (typeof isActive !== "boolean") {
      res.status(400).json({
        success: false,
        message: "isActive doit être vrai ou faux.",
      });
      return;
    }
    if (req.user?.userId === id && isActive === false) {
  res.status(400).json({
    success: false,
    message: "Vous ne pouvez pas désactiver votre propre compte.",
  });
  return;
}
    

    const existingUser = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    role: true,
    isActive: true,
  },
});

if (!existingUser) {
  res.status(404).json({
    success: false,
    message: "Employé introuvable.",
  });
  return;
}

if (
  existingUser.role === "ADMIN" &&
  existingUser.isActive &&
  isActive === false
) {
  const activeAdminCount = await prisma.user.count({
    where: {
      role: "ADMIN",
      isActive: true,
    },
  });

  if (activeAdminCount <= 1) {
    res.status(400).json({
      success: false,
      message:
        "Impossible de désactiver le dernier administrateur actif.",
    });
    return;
  }
}

  

    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
    await recordAuditLog({
  userId: req.user!.userId,
  action: "USER_STATUS_UPDATED",
  entity: "User",
  entityId: id,
  details: `Statut du compte modifié : ${
    isActive ? "activé" : "désactivé"
  }.`,
});

    res.status(200).json({
      success: true,
      message: isActive
        ? "Compte employé activé."
        : "Compte employé désactivé.",
      user,
    });
  } catch (error) {
    console.error("Échec de la modification du statut du compte :", error);
    res.status(500).json({
      success: false,
      message: "Une erreur inattendue est survenue.",
    });
  }
});


router.post("/", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
const { fullName, email, phone, password, role, agencyId } = req.body as {
  fullName?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: string;
  agencyId?: string;
};
    if (
      typeof fullName !== "string" ||
      !fullName.trim() ||
      typeof password !== "string" ||
      password.length < 12 ||
      typeof role !== "string" ||
      !validRoles.includes(role as (typeof validRoles)[number])
    ) {
      res.status(400).json({
        success: false,
        message: "Le nom, un mot de passe d'au moins 12 caractères et un rôle valide sont requis.",
      });
      return;
    }
    const normalizedAgencyId =
  typeof agencyId === "string" && agencyId.trim()
    ? agencyId.trim()
    : null;

if (role === "PARTNER" && !normalizedAgencyId) {
  res.status(400).json({
    success: false,
    message: "Une agence est obligatoire pour un compte partenaire.",
  });
  return;
}

if (normalizedAgencyId) {
  const agency = await prisma.agency.findUnique({
    where: { id: normalizedAgencyId },
    select: { id: true, isActive: true },
  });

  if (!agency || !agency.isActive) {
    res.status(400).json({
      success: false,
      message: "Agence introuvable ou inactive.",
    });
    return;
  }
}

if (role !== "PARTNER" && normalizedAgencyId) {
  res.status(400).json({
    success: false,
    message: "Seuls les comptes partenaires peuvent être liés à une agence.",
  });
  return;
}

    const normalizedEmail =
      typeof email === "string" && email.trim()
        ? email.trim().toLowerCase()
        : null;

    const normalizedPhone =
      typeof phone === "string" && phone.trim()
        ? phone.trim()
        : null;
        if (
  normalizedPhone &&
  !/^\+?[0-9\s()-]{7,20}$/.test(normalizedPhone)
) {
  res.status(400).json({
    success: false,
    message: "Le numéro de téléphone est invalide.",
  });
  return;
}

    if (!normalizedEmail && !normalizedPhone) {
      res.status(400).json({
        success: false,
        message: "Veuillez fournir une adresse e-mail ou un numéro de téléphone.",
      });
      return;
    }

    if (
  normalizedEmail &&
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
) {
      res.status(400).json({
        success: false,
        message: "Adresse e-mail invalide.",
      });
      return;
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        ],
      },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "Cet e-mail ou ce numéro de téléphone est déjà enregistré.",
      });
      return;
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
  fullName: fullName.trim(),
  email: normalizedEmail,
  phone: normalizedPhone,
  passwordHash,
  role: role as (typeof validRoles)[number],
  agencyId: normalizedAgencyId,
},
      select: {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  agencyId: true,
  isActive: true,
  createdAt: true,
},
    });
    await recordAuditLog({
  userId: (req as AuthenticatedRequest).user!.userId,
  action: "USER_CREATED",
  entity: "User",
  entityId: user.id,
  details: `Compte employé créé : ${user.fullName}, rôle ${user.role}.`,
});

    res.status(201).json({
      success: true,
      message: "Compte employé créé avec succès.",
      user,
    });
  } catch (error) {
    console.error("Échec de la création du compte du personnel :", error);
    res.status(500).json({
      success: false,
      message: "Une erreur inattendue est survenue.",
    });
  }
});

export default router;