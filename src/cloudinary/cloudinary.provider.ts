import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as CloudinaryAPI, ConfigOptions } from 'cloudinary';

interface CloudinaryStatic {
  config(options: ConfigOptions): ConfigOptions;
}

export const CLOUDINARY = 'CLOUDINARY';
export const CloudinaryProvider: Provider = {
  provide: CLOUDINARY,
  useFactory: (configService: ConfigService) => {
    const cloudName = configService.get<string>('CLD_NAME');
    const apiKey = configService.get<string>('CLD_API_KEY');
    const apiSecret = configService.get<string>('CLD_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary configuration is missing in .env file');
    }

    const cloudinary = CloudinaryAPI as unknown as CloudinaryStatic;

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    return cloudinary;
  },
  inject: [ConfigService],
};
