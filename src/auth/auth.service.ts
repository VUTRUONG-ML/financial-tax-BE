import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TokenService } from '../token/token.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: CreateUserDto) {
    // 1. Cấu hình độ khó của thuật toán băm (Salt Rounds)
    const saltRounds = 10;

    // 2. Băm mật khẩu (Hash Password)
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    // 3. Chuyển đổi dữ liệu từ DTO (Client) sang Prisma Input (Database)
    const userPayload: Prisma.UserCreateInput = {
      phoneNumber: dto.phoneNumber,
      passwordHash: hashedPassword,
      taxCode: dto.taxCode,
      businessName: dto.businessName,
      ownerName: dto.ownerName,
      cccdNumber: dto.cccdNumber,
      provinceCity: dto.provinceCity,
    };

    const newUser = await this.usersService.create(userPayload);

    // 5. Bảo mật dữ liệu đầu ra (Sanitize Output)
    const { passwordHash, ...userWithoutPassword } = newUser;

    // 6. Trả về kết quả (Tuỳ chọn: Trả thêm token nếu muốn user đăng nhập luôn)
    return userWithoutPassword;
  }

  async login(
    dto: LoginDto,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    // 1. Tìm user theo số điện thoại
    const user = await this.usersService.findByPhone(dto.phoneNumber);

    // 2. Kiểm tra sự tồn tại của user
    // Nếu không có user, lập tức báo lỗi chung chung (AUTH_FAILED)
    if (!user)
      throw new UnauthorizedException('Phone number or password is invalid');

    // 3. So khớp mật khẩu đã hash bằng bcrypt
    const isPasswordMatch = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordMatch)
      throw new UnauthorizedException('Phone number or password is invalid');

    // 4. Khởi tạo Token (Lúc này chứng tỏ user hoàn toàn hợp lệ)
    const { accessToken, refreshToken } =
      await this.tokenService.generateAuthTokens(
        user.id,
        user.role,
        user.phoneNumber,
      );

    // 5. TODO: Lưu refreshToken vào database
    await this.tokenService.saveRefreshToken(
      user.id,
      refreshToken,
      ipAddress,
      userAgent,
    );
    // 6. Trả về token cho Client
    const { passwordHash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, accessToken, refreshToken };
  }
  async getProfile(phone: string) {
    const user = await this.usersService.findByPhone(phone);
    if (!user) throw new NotFoundException('User not found.');
    const { passwordHash, ...userWithoutPass } = user;
    return userWithoutPass;
  }
}
