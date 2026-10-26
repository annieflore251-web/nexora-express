import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./swagger.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./lib/prisma.js";
import authRoutes from "./routes/auth.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "./auth/authenticate.js";
import { authorize } from "./auth/authorize.js";
import userRoutes from "./routes/users.js";
import parcelRoutes from "./routes/parcels.js";
dotenv.config();
import dashboardRoutes from "./routes/dashboard.js";
import auditRoutes from "./routes/audit.js";
import agencyRoutes from "./routes/agencies.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pricingRoutes from "./routes/pricing.js";
import parcelImportRoutes from "./routes/parcel-import.js";
import recipientConfirmationRoutes from "./routes/recipient-confirmation.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;
app.use(helmet());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Trop de tentatives de connexion. Réessayez dans 15 minutes.",
  },
});

app.use(cors());
app.use(express.json());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/parcels/import", parcelImportRoutes);
app.use("/api/parcels", parcelRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/agencies", agencyRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/recipient-confirmation", recipientConfirmationRoutes);


app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "L'API NEXORA EXPRESS fonctionne correctement.",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/db-check", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "Connexion à PostgreSQL réussie.",
    });
  } catch (error) {
    console.error("Échec de la connexion à la base de données :", error);

    res.status(500).json({
      success: false,
      message: "Échec de la connexion à la base de données.",
    });
  }
});

app.get("/api/auth/me", authenticate, (req, res) => {
  const authReq = req as AuthenticatedRequest;

  res.status(200).json({
    success: true,
    user: authReq.user,
  });
});

app.get(
  "/api/admin/test",
  authenticate,
  authorize("ADMIN"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      message: "Accès administrateur autorisé.",
    });
  }
);
app.use(
  (
    error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Erreur inattendue de l'API :", error);

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      success: false,
      message: "Une erreur inattendue s'est produite.",
    });
  }
);

app.listen(PORT, () => {
  console.log(`API NEXORA EXPRESS démarrée sur http://localhost:${PORT}`);
});
