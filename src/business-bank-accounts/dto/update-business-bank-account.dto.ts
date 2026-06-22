import { PartialType } from '@nestjs/swagger';
import { CreateBusinessBankAccountDto } from './create-business-bank-account.dto';

/**
 * UpdateBusinessBankAccountDto kế thừa tất cả field từ Create, tất cả optional.
 * Không cho phép thay đổi userId (được enforce ở service layer).
 */
export class UpdateBusinessBankAccountDto extends PartialType(CreateBusinessBankAccountDto) {}
