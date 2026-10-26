
import { randomUUID } from "node:crypto";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileTypeFromFile } from "file-type";

const uploadDirectory = path.resolve("uploads", "parcels");

fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (_req, _file, callback) => {
    callback(null, randomUUID());
  },
});

export const parcelPhotoUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error("Format d'image non autorisé."));
      return;
    }

    callback(null, true);
  },
});

// Validate the actual file contents after upload.
export async function validateUploadedPhoto(
  filePath: string
): Promise<boolean> {
  const fileType = await fileTypeFromFile(filePath);

  return fileType !== undefined && allowedMimeTypes.has(fileType.mime);
}
