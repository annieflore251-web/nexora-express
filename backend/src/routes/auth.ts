
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "../auth/password.js";
import { createAuthToken } from "../auth/token.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body as {
      identifier?: string;
      password?: string;
    };

    if (
      typeof identifier !== "string" ||
      !identifier.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      res.status(400).json({
        success: false,
        message:
          "L'adresse e-mail ou le numéro de téléphone et le mot de passe sont requis.",
      });
      return;
    }

    const value = identifier.trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: value }, { phone: value }],
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: "Identifiants incorrects.",
      });
      return;
    }

    const passwordIsValid = await verifyPassword(
      password,
      user.passwordHash
    );

    if (!passwordIsValid) {
      res.status(401).json({
        success: false,
        message: "Identifiants incorrects.",
      });
      return;
    }

    const token = createAuthToken({
      userId: user.id,
      role: user.role,
    });

    res.status(200).json({
      success: true,
      message: "Connexion réussie.",
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Échec de la connexion :", error);
    res.status(500).json({
      success: false,
      message: "Une erreur inattendue s'est produite.",
    });
  }
});

export default router;
