import { ClassConstructor, plainToInstance } from 'class-transformer';

export function mapToDto<T, V>(cls: ClassConstructor<T>, plain: V): T {
  const flattened = JSON.parse(JSON.stringify(plain));
  return plainToInstance(cls, flattened, { excludeExtraneousValues: true });
}
