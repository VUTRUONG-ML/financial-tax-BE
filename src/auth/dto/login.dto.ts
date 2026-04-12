import { PickType } from '@nestjs/swagger';
import { CreateUserDto } from '../../users/dto/create-user.dto';

/**
 * Tái sử dụng toàn bộ logic validate (@IsPhoneNumber, @Length) từ CreateUserDto
 */
export class LoginDto extends PickType(CreateUserDto, [
  'phoneNumber',
  'password',
] as const) {}
