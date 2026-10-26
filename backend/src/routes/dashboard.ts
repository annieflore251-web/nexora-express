
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../auth/authenticate.js";
import { authorize } from "../auth/authorize.js";
import { stringify } from "csv-stringify/sync";

const router = Router();

router.get(
  "/stats",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  async (_req, res) => {
    try {
      const [totalParcels, statusCounts] = await Promise.all([
        prisma.parcel.count(),
        prisma.parcel.groupBy({
          by: ["status"],
          _count: {
            _all: true,
          },
        }),
      ]);

      const parcelsByStatus = {
        RECEIVED: 0,
        REGISTERED: 0,
        AWAITING_DELIVERY: 0,
        OUT_FOR_DELIVERY: 0,
        DELIVERED: 0,
        DELIVERY_FAILED: 0,
        RETURNED: 0,
      };

      for (const item of statusCounts) {
        parcelsByStatus[item.status] = item._count._all;
      }

      return res.status(200).json({
        success: true,
        message: "Statistiques récupérées avec succès.",
        totalParcels,
        parcelsByStatus,
      });
    } catch (error) {
      console.error("Erreur lors du chargement des statistiques :", error);

      return res.status(500).json({
        success: false,
        message: "Impossible de récupérer les statistiques.",
      });
    }
  }
);

router.get(
  "/delivery-report",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  async (_req, res) => {
    try {
      const [
        delivered,
        failed,
        awaitingDelivery,
        outForDelivery,
      ] = await Promise.all([
        prisma.parcel.count({
          where: { status: "DELIVERED" },
        }),
        prisma.parcel.count({
          where: { status: "DELIVERY_FAILED" },
        }),
        prisma.parcel.count({
          where: { status: "AWAITING_DELIVERY" },
        }),
        prisma.parcel.count({
          where: { status: "OUT_FOR_DELIVERY" },
        }),
      ]);

      return res.status(200).json({
        success: true,
        message: "Rapport de livraison récupéré avec succès.",
        report: {
          delivered,
          failed,
          awaitingDelivery,
          outForDelivery,
        },
      });
    } catch (error) {
      console.error("Erreur lors du rapport de livraison :", error);

      return res.status(500).json({
        success: false,
        message: "Impossible de générer le rapport de livraison.",
      });
    }
  }
);

router.get(
  "/delivery-report/export",
  authenticate,
  authorize("ADMIN", "COORDINATOR"),
  async (req, res) => {
    try {
      const startDate =
        typeof req.query.startDate === "string"
          ? new Date(req.query.startDate)
          : null;

     const endDate =
  typeof req.query.endDate === "string"
    ? new Date(req.query.endDate)
    : null;

if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate as string)) {
  endDate.setHours(23, 59, 59, 999);
}

      if (
        (startDate && Number.isNaN(startDate.getTime())) ||
        (endDate && Number.isNaN(endDate.getTime()))
      ) {
        res.status(400).json({
          success: false,
          message: "Format de date invalide.",
        });
        return;
      }

      if (startDate && endDate && startDate > endDate) {
        res.status(400).json({
          success: false,
          message: "La date de début doit précéder la date de fin.",
        });
        return;
      }

      const createdAt: { gte?: Date; lte?: Date } = {};

      if (startDate) createdAt.gte = startDate;
      if (endDate) createdAt.lte = endDate;

      const parcels = await prisma.parcel.findMany({
        where: Object.keys(createdAt).length ? { createdAt } : {},
        select: {
          trackingNumber: true,
          externalTrackingNumber: true,
          recipientName: true,
          recipientPhone: true,
          recipientAddress: true,
          deliveryZone: true,
          deliveryFee: true,
          status: true,
          createdAt: true,
          deliveredAt: true,
          preferredDeliveryDate: true,
          preferredTimeSlot: true,
          assignedCourier: {
  select: { fullName: true },
},
        },
        orderBy: { createdAt: "desc" },
      });

      const csv = stringify(
        parcels.map((parcel) => ({
          trackingNumber: parcel.trackingNumber,
          externalTrackingNumber: parcel.externalTrackingNumber ?? "",
          recipientName: parcel.recipientName,
          recipientPhone: parcel.recipientPhone,
          recipientAddress: parcel.recipientAddress ?? "",
          deliveryZone: parcel.deliveryZone ?? "",
          deliveryFeeXAF: parcel.deliveryFee ?? "",
          status: parcel.status,
          registeredAt: parcel.createdAt.toISOString(),
          deliveredAt: parcel.deliveredAt?.toISOString() ?? "",
          preferredDeliveryDate:
            parcel.preferredDeliveryDate?.toISOString() ?? "",
          preferredTimeSlot: parcel.preferredTimeSlot ?? "",
          assignedCourier: parcel.assignedCourier?.fullName ?? "",
        })),
        { header: true }
      );

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="nexora-delivery-report.csv"'
      );

      res.status(200).send("\uFEFF" + csv);
    } catch (error) {
      console.error("Erreur lors de l'export du rapport :", error);
      res.status(500).json({
        success: false,
        message: "Impossible d'exporter le rapport de livraison.",
      });
    }
  }
);


export default router;
