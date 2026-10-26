
const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "NEXORA EXPRESS API",
    version: "1.0.0",
    description: "API de gestion des colis de NEXORA EXPRESS.",
  },
  servers: [
    {
      url: "http://localhost:4000",
      description: "Serveur local",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/health": {
      get: {
        summary: "Vérifier le fonctionnement de l'API",
        security: [],
        responses: {
          "200": { description: "L'API fonctionne." },
        },
      },
    },

    "/api/db-check": {
      get: {
        summary: "Vérifier la connexion à la base de données",
        security: [],
        responses: {
          "200": { description: "Connexion réussie." },
        },
      },
    },

    "/api/auth/login": {
      post: {
        summary: "Se connecter",
        description:
          "Authentification par adresse e-mail ou numéro de téléphone et mot de passe.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["identifier", "password"],
                properties: {
                  identifier: {
                    type: "string",
                    example: "admin@example.com",
                  },
                  password: {
                    type: "string",
                    format: "password",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Connexion réussie. Jeton JWT retourné." },
          "400": { description: "Informations de connexion manquantes." },
          "401": { description: "Identifiants incorrects." },
        },
      },
    },

    "/api/parcels": {
      get: {
        summary: "Lister les colis",
        description:
          "Réservé aux administrateurs, coordinateurs et livreurs. Les livreurs voient uniquement leurs colis assignés.",
        responses: {
          "200": {
            description: "Liste des colis récupérée avec succès.",
          },
          "401": { description: "Authentification requise." },
          "403": { description: "Accès refusé." },
        },
      },

      post: {
        summary: "Enregistrer un nouveau colis",
        description: "Réservé aux administrateurs et coordinateurs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["recipientName", "recipientPhone"],
                properties: {
                  externalTrackingNumber: { type: "string" },
                  sendingAgency: { type: "string" },
                  recipientName: {
                    type: "string",
                    example: "Jean Dupont",
                  },
                  recipientPhone: {
                    type: "string",
                    example: "+237600000000",
                  },
                  recipientAddress: { type: "string" },
                  deliveryInstructions: { type: "string" },
                  description: { type: "string" },
                  conditionOnArrival: { type: "string" },
                  sealNumber: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Colis enregistré avec succès." },
          "400": { description: "Données invalides." },
          "401": { description: "Authentification requise." },
          "403": { description: "Accès refusé." },
        },
      },
    },

    "/api/parcels/{id}": {
      get: {
        summary: "Consulter les détails d'un colis",
        description:
          "Récupère les détails d'un colis, son historique de statuts et ses photos. Les livreurs peuvent consulter uniquement leurs colis assignés.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Identifiant interne UUID du colis.",
            schema: {
              type: "string",
              format: "uuid",
            },
          },
        ],
        responses: {
          "200": {
            description: "Détails du colis récupérés avec succès.",
          },
          "401": { description: "Authentification requise." },
          "403": { description: "Accès refusé." },
          "404": { description: "Colis introuvable." },
        },
      },
    },
    
    "/api/parcels/{id}/delivery-otp": {
      post: {
        summary: "Envoyer le code OTP de livraison par SMS",
        description:
          "Réservé au livreur affecté au colis. Envoie un code de confirmation valable 5 minutes au destinataire.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Identifiant UUID du colis.",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "Code OTP envoyé ou accepté par le fournisseur SMS." },
          "400": { description: "Colis non éligible ou numéro invalide." },
          "401": { description: "Authentification requise." },
          "403": { description: "Accès refusé ou colis non assigné au livreur." },
          "404": { description: "Colis introuvable." },
          "500": { description: "Erreur lors de l'envoi du SMS." },
        },
      },
    },

    "/api/parcels/{id}/verify-delivery-otp": {
      post: {
        summary: "Vérifier le code OTP de livraison",
        description:
          "Réservé au livreur affecté au colis. Le code doit comporter 6 chiffres et ne peut être validé après expiration.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Identifiant UUID du colis.",
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["code"],
                properties: {
                  code: {
                    type: "string",
                    pattern: "^\\d{6}$",
                    example: "123456",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Code OTP vérifié avec succès." },
          "400": { description: "Code invalide, expiré ou nombre maximal de tentatives atteint." },
          "401": { description: "Authentification requise." },
          "403": { description: "Accès refusé ou colis non assigné au livreur." },
          "404": { description: "Colis ou code OTP introuvable." },
        },
      },
    },

    
    "/api/parcels/tracking/{trackingNumber}": {
      get: {
        summary: "Suivre un colis publiquement",
        description:
          "Permet de consulter le statut et l'historique d'un colis sans authentification. Aucune information personnelle du destinataire n'est exposée.",
        security: [],
        parameters: [
          {
            name: "trackingNumber",
            in: "path",
            required: true,
            description: "Numéro de suivi du colis.",
            schema: {
              type: "string",
            },
            example: "NX-ABC12345",
          },
        ],
        responses: {
          "200": {
            description: "Informations de suivi récupérées avec succès.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: {
                      type: "boolean",
                      example: true,
                    },
                    tracking: {
                      type: "object",
                      properties: {
                        trackingNumber: { type: "string" },
                        status: { type: "string" },
                        createdAt: {
                          type: "string",
                          format: "date-time",
                        },
                        receivedAt: {
                          type: "string",
                          format: "date-time",
                          nullable: true,
                        },
                        deliveredAt: {
                          type: "string",
                          format: "date-time",
                          nullable: true,
                        },
                        statusHistory: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              status: { type: "string" },
                              changedAt: {
                                type: "string",
                                format: "date-time",
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Numéro de suivi manquant ou invalide." },
          "404": { description: "Colis introuvable." },
          "500": { description: "Erreur interne du serveur." },
        },
      },
    },

    
    "/api/agencies": {
      get: {
        summary: "Lister les agences",
        description: "Réservé aux administrateurs et coordinateurs.",
        parameters: [
          {
            name: "search",
            in: "query",
            schema: { type: "string" },
            description: "Rechercher par nom, code ou ville.",
          },
          {
            name: "active",
            in: "query",
            schema: { type: "boolean" },
            description: "Filtrer par statut actif ou inactif.",
          },
        ],
        responses: {
          "200": { description: "Liste des agences." },
          "401": { description: "Authentification requise." },
          "403": { description: "Accès refusé." },
        },
      },
      post: {
        summary: "Créer une agence",
        description: "Réservé aux administrateurs et coordinateurs.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "code"],
                properties: {
                  name: { type: "string", example: "Agence Centrale" },
                  code: { type: "string", example: "AG-YDE-001" },
                  city: { type: "string", example: "Yaoundé" },
                  address: { type: "string" },
                  phone: { type: "string" },
                  email: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Agence créée." },
          "400": { description: "Données invalides." },
          "409": { description: "Code déjà utilisé." },
        },
      },
    },

    "/api/agencies/{id}": {
      get: {
        summary: "Consulter une agence et ses colis récents",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": { description: "Agence trouvée." },
          "404": { description: "Agence introuvable." },
        },
      },
      patch: {
        summary: "Modifier ou désactiver une agence",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  code: { type: "string" },
                  city: { type: "string", nullable: true },
                  address: { type: "string", nullable: true },
                  phone: { type: "string", nullable: true },
                  email: { type: "string", nullable: true },
                  isActive: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Agence mise à jour." },
          "404": { description: "Agence introuvable." },
        },
      },
    },

  },
};

export default swaggerDocument;
