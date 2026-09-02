import 'multer';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BadRequestException } from '@nestjs/common';

/**
 * Multer disk storage configuration for Incident Management uploads.
 * Saves files into `./uploads/incidents/` directory with unique timestamped filenames.
 */
export const incidentMulterConfig = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = join(process.cwd(), 'uploads', 'incidents');
      if (!existsSync(uploadPath)) {
        mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const randomName = Array(16)
        .fill(null)
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join('');
      const fileExt = extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `inc_${Date.now()}_${randomName}${fileExt}`);
    },
  }),
  fileFilter: (req: any, file: any, cb: any) => {
    // Accept images and document attachments
    if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp|heic|heif|pdf|msword|vnd.openxmlformats-officedocument.wordprocessingml.document)$/)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`Unsupported file type ${file.mimetype}. Allowed: Images (JPG, PNG, WEBP, HEIC) and PDF/Word documents.`), false);
    }
  },
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max file size
  },
};
