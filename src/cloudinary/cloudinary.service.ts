import { BadRequestException, Injectable } from '@nestjs/common';
import {
  v2 as cloudinary,
  UploadApiErrorResponse,
  UploadApiResponse,
} from 'cloudinary';
import { CloudinaryResponse } from '../common/interface/cloudinary-response';
import * as streamifier from 'streamifier';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
@Injectable()
export class CloudinaryService {
  private readonly logger = new AppLogger(CloudinaryService.name);

  uploadFile(file: Express.Multer.File): Promise<CloudinaryResponse> {
    const options = {
      public_id: `product_${Date.now()}`,
      folder: 'financial_tax_system/products',
      overwrite: true,
    };
    if (!file) {
      this.logger.warn(LOG_ACTIONS.UPLOAD_IMG, {
        status: LOG_STATUS.FAILED,
        reason: 'FILE_NOT_EXIST',
      });
      throw new BadRequestException('The file does not exist.');
    }
    return new Promise<CloudinaryResponse>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        options,
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) {
            const errorMessage =
              typeof error === 'object' && 'message' in error
                ? String(error.message)
                : 'Cloudinary upload failed';
            return reject(new Error(errorMessage));
          }
          if (!result)
            return reject(new Error('Upload failed: Result is undefined'));
          resolve(result);
        },
      );
      // Đẩy buffer từ multer vào stream của Cloudinary
      streamifier.createReadStream(file.buffer).pipe(upload);
    });
  }
}
