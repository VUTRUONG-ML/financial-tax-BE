import { Body, Controller, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch()
  async updateUser(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    const result = await this.usersService.updateUser(dto, userId);
    return {
      message: 'Update user success.',
      data: result,
    };
  }
}
