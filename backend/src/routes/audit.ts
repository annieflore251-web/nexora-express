
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../auth/authenticate.js";
import { authorize } from "../auth/authorize.js";

const router = Router();

router.get("/", authenticate, authorize("ADMIN"), async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit ?? 20);
    const rawPage = Number(req.query.page ?? 1);

    if (
      !Number.isInteger(rawLimit) ||
      rawLimit < 1 ||
      rawLimit > 100 ||
      !Number.isInteger(rawPage) ||
      rawPage < 1
    ) {
      res.status(400).json({
        success: false,
        message: "La page doit être positive et la limite doit être comprise entre 1 et 100.",
      });
      return;
    }

    const skip = (rawPage - 1) * rawLimit;

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        skip,
        take: rawLimit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
      }),
      prisma.auditLog.count(),
    ]);

    res.status(200).json({
      success: true,
      page: rawPage,
      limit: rawLimit,
      total,
      totalPages: Math.ceil(total / rawLimit),
      logs,
    });
  } catch (error) {
    console.error("Échec de la récupération des journaux d'audit :", error);
    res.status(500).json({
      success: false,
      message: "Une erreur inattendue est survenue.",
    });
  }
});

export default router;
