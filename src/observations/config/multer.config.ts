import 'multer';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BadRequestException } from '@nestjs/common';

/**
 * Multer disk storage configuration for Observation Management photo uploads.
 * Saves files into `./uploads/observations/` directory with unique timestamped filenames.
 */
export const observationMulterConfig = {
  storage: diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = join(process.cwd(), 'uploads', 'observations');
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
      cb(null, `obs_${Date.now()}_${randomName}${fileExt}`);
    },
  }),
  fileFilter: (req: any, file: any, cb: any) => {
    if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp|heic|heif|pdf)$/)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`Unsupported file type ${file.mimetype}. Allowed: Images (JPG, PNG, WEBP, HEIC) and PDF files.`), false);
    }
  },
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB limit
  },
};
