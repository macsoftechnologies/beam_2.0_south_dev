import 'multer';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BadRequestException } from '@nestjs/common';

/**
 * Multer disk storage configuration for Observation Management photo/document uploads.
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
      let fileExt = extname(file.originalname).toLowerCase();
      const mime = (file.mimetype || '').toLowerCase();
      if (mime.includes('pdf')) fileExt = '.pdf';
      else if (mime.includes('presentationml')) fileExt = '.pptx';
      else if (mime.includes('powerpoint')) fileExt = '.ppt';
      else if (mime.includes('wordprocessingml')) fileExt = '.docx';
      else if (mime.includes('msword')) fileExt = '.doc';
      else if (mime.includes('spreadsheetml')) fileExt = '.xlsx';
      else if (mime.includes('excel')) fileExt = '.xls';
      else if (mime.includes('png')) fileExt = '.png';
      else if (mime.includes('jpeg') || mime.includes('jpg')) fileExt = '.jpg';
      else if (mime.includes('webp')) fileExt = '.webp';
      else if (mime.includes('plain')) fileExt = '.txt';
      else if (mime.includes('csv')) fileExt = '.csv';
      else if (!fileExt || fileExt === '.') fileExt = '.jpg';

      cb(null, `obs_${Date.now()}_${randomName}${fileExt}`);
    },
  }),
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedMime = /\/(jpg|jpeg|png|gif|webp|heic|heif|pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)|vnd\.ms-powerpoint|vnd\.ms-excel|plain|csv)$/i;
    const allowedExt = /\.(jpg|jpeg|png|gif|webp|heic|heif|pdf|doc|docx|ppt|pptx|xls|xlsx|txt|csv)$/i;
    if (allowedMime.test(file.mimetype) || allowedExt.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`Unsupported file type ${file.mimetype}. Allowed: Images (JPG, PNG, WEBP), PDF, Word, PowerPoint, Excel, and Text documents.`), false);
    }
  },
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB limit
  },
};
