import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { Prisma, User } from '@prisma/client';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Tạo user mới.
   * Dữ liệu truyền vào đây phải là dữ liệu đã được AuthService băm password.
   */
  async create(data: Prisma.UserCreateInput): Promise<User> {
    const newUser = await this.prismaService.user.create({
      data,
    });
    return newUser;
  }

  /**
   * Tìm user bằng số điện thoại (Dùng cho luồng Login)
   */
  async findByPhone(phoneNumber: string): Promise<User | null> {
    return this.prismaService.user.findUnique({
      where: {
        phoneNumber,
      },
    });
  }

  async updateUser(data: UpdateUserDto, userId: string) {
    return await this.prismaService.user.update({
      where: { id: userId },
      data: {
        taxCode: data.taxCode,
        businessName: data.businessName,
        ownerName: data.ownerName,
        provinceCity: data.provinceCity,
      },
      omit: { passwordHash: true },
    });
  }
}
