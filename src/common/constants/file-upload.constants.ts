import {
  MaxFileSizeValidator,
  FileTypeValidator,
  ParseFilePipe,
} from '@nestjs/common';

export const ImageUploadPipe = new ParseFilePipe({
  fileIsRequired: false,
  validators: [
    new MaxFileSizeValidator({
      maxSize: 1024 * 1024 * 2,
      message: 'Image size must not exceed 2MB.',
    }),
    new FileTypeValidator({
      fileType: '.(png|jpeg|jpg)',
    }),
  ],
});
