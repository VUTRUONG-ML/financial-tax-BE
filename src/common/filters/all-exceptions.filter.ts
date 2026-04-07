import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

// @Catch() không truyền tham số nghĩa là nó sẽ bắt MỌI loại Exception
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  // Khởi tạo Logger mặc định của NestJS để trace bug trên console
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Trạng thái và thông báo mặc định nếu rớt vào lỗi không xác định (Lỗi 500)
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] =
      'Internal system error. Please try again later.';

    // 1. Phân giải lỗi từ Prisma Client
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // Unique constraint failed
          status = HttpStatus.CONFLICT; // 409
          message = 'The data already exists in the system (Unique Duplicate).';
          break;
        case 'P2003': // Foreign key constraint failed
          status = HttpStatus.BAD_REQUEST; // 400
          message = 'The linked data does not exist or is invalid.';
          break;
        case 'P2025': // Record to update/delete not found
          status = HttpStatus.NOT_FOUND; // 404
          message = 'No data was found to perform the operation.';
          break;
        default:
          // Xử lý chung cho các P-code khác của Prisma
          status = HttpStatus.BAD_REQUEST;
          message = `Database access error: ${exception.message.split('\n').pop()}`;
          break;
      }
    }
    // 2. Phân giải lỗi HTTP thông thường (VD: NotFoundException, BadRequestException)
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        // Ép kiểu an toàn về Record
        const responseObj = exceptionResponse as Record<string, unknown>;

        // Trích xuất an toàn. Nếu là lỗi từ class-validator, nó thường là mảng string[]
        message =
          (responseObj.message as string | string[]) || exception.message;
      }
    }
    // 3. Các lỗi Runtime khác (TypeError, ReferenceError...)
    else if (exception instanceof Error) {
      message = exception.message;
    }

    // Ghi Log hệ thống (Có thể thay bằng service lưu vào DB Audit Log)
    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Error: ${JSON.stringify(message)}`,
    );

    // Chuẩn hóa định dạng Response trả về cho Frontend
    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
    });
  }
}
