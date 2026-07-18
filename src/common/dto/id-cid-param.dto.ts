import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class DoubleIdParamsDTO {
  @ApiProperty({
    description: "First Unique identifier",
    example: "d290f1ee-6c54-4b01-90e6-d701748f0851",
  })
  @IsUUID()
  id!: string;

  @ApiProperty({
    description: "Second Unique identifier",
    example: "c07b9d8b-2bb1-4f22-9a65-7f7b5edb6312",
  })
  @IsUUID()
  cid!: string;
}
