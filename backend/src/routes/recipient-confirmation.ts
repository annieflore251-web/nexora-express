
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { recordAuditLog } from "../lib/audit.js";

const router = Router();

function getPublicParcelDetails(parcel: {
  trackingNumber: string;
  recipientName: string;
  recipientAddress: string | null;
  preferredDeliveryDate: Date | null;
  preferredTimeSlot: string | null;
  recipientConfirmedAt: Date | null;
}) {
  return {
    trackingNumber: parcel.trackingNumber,
    recipientName: parcel.recipientName,
    recipientAddress: parcel.recipientAddress,
    preferredDeliveryDate: parcel.preferredDeliveryDate,
    preferredTimeSlot: parcel.preferredTimeSlot,
    confirmed: parcel.recipientConfirmedAt !== null,
  };
}

// Retrieve parcel details using the private confirmation token.
router.get("/:token", async (req, res) => {
  try {
    const token = req.params.token;

    const parcel = await prisma.parcel.findUnique({
      where: { recipientConfirmationToken: token },
      select: {
        trackingNumber: true,
        recipientName: true,
        recipientAddress: true,
        preferredDeliveryDate: true,
        preferredTimeSlot: true,
        recipientConfirmedAt: true,
      },
    });

    if (!parcel) {
      res.status(404).json({
        success: false,
        message: "Lien de confirmation invalide ou introuvable.",
      });
      return;
    }

    res.json({
      success: true,
      parcel: getPublicParcelDetails(parcel),
    });
  } catch (error) {
    console.error("Recipient confirmation lookup failed:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des informations.",
    });
  }
});

// Confirm the recipient's address and preferred delivery slot.
router.patch("/:token", async (req, res) => {
  try {
    const token = req.params.token;
    const { recipientAddress, preferredDeliveryDate, preferredTimeSlot } =
      req.body;

    if (
      typeof recipientAddress !== "string" ||
      recipientAddress.trim().length < 5 ||
      recipientAddress.trim().length > 500
    ) {
      res.status(400).json({
        success: false,
        message: "Veuillez fournir une adresse valide (5 à 500 caractères).",
      });
      return;
    }

    if (
      typeof preferredDeliveryDate !== "string" ||
      Number.isNaN(Date.parse(preferredDeliveryDate))
    ) {
      res.status(400).json({
        success: false,
        message: "Veuillez fournir une date de livraison valide.",
      });
      return;
    }

    const deliveryDate = new Date(preferredDeliveryDate);

    if (deliveryDate.getTime() < new Date().setHours(0, 0, 0, 0)) {
      res.status(400).json({
        success: false,
        message: "La date de livraison ne peut pas être dans le passé.",
      });
      return;
    }

    if (
      typeof preferredTimeSlot !== "string" ||
      preferredTimeSlot.trim().length === 0 ||
      preferredTimeSlot.trim().length > 50
    ) {
      res.status(400).json({
        success: false,
        message: "Veuillez fournir un créneau horaire valide.",
      });
      return;
    }

    const parcel = await prisma.parcel.findUnique({
      where: { recipientConfirmationToken: token },
      select: {
        id: true,
        recipientConfirmedAt: true,
      },
    });

    if (!parcel) {
      res.status(404).json({
        success: false,
        message: "Lien de confirmation invalide ou introuvable.",
      });
      return;
    }

    if (parcel.recipientConfirmedAt) {
      res.status(409).json({
        success: false,
        message: "Cette livraison a déjà été confirmée.",
      });
      return;
    }

    // Only one request can confirm this parcel successfully.
    const result = await prisma.parcel.updateMany({
      where: {
        id: parcel.id,
        recipientConfirmedAt: null,
      },
      data: {
        recipientAddress: recipientAddress.trim(),
        preferredDeliveryDate: deliveryDate,
        preferredTimeSlot: preferredTimeSlot.trim(),
        recipientConfirmedAt: new Date(),
      },
    });

    if (result.count === 0) {
      res.status(409).json({
        success: false,
        message: "Cette livraison a déjà été confirmée.",
      });
      return;
    }
    await recordAuditLog({
  action: "RECIPIENT_CONFIRMED",
  entity: "Parcel",
  entityId: parcel.id,
  details: "Le destinataire a confirmé son adresse et ses préférences de livraison.",
});

    const updatedParcel = await prisma.parcel.findUnique({
      where: { id: parcel.id },
      select: {
        trackingNumber: true,
        recipientName: true,
        recipientAddress: true,
        preferredDeliveryDate: true,
        preferredTimeSlot: true,
        recipientConfirmedAt: true,
      },
    });

    res.json({
      success: true,
      message: "Les informations de livraison ont été confirmées.",
      parcel: updatedParcel ? getPublicParcelDetails(updatedParcel) : null,
    });
  } catch (error) {
    console.error("Recipient confirmation failed:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la confirmation de la livraison.",
    });
  }
});

export default router;
