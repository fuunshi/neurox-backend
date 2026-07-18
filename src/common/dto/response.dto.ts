import { HttpStatus } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";

export class ResponseDTO<T> {
  @ApiProperty({ example: true })
  readonly success!: boolean;

  @ApiProperty({ example: "Request was successful" })
  readonly message!: string;

  @ApiProperty({ example: 200 })
  readonly statusCode!: number;

  readonly responseObject?: T;

  constructor(
    success: boolean,
    message: string,
    statusCode: number,
    responseObject?: T,
  ) {
    this.success = success;
    this.message = message;
    this.statusCode = statusCode;
    this.responseObject = responseObject;
  }

  static success<T>(
    message: string,
    responseObject?: T,
    statusCode = 200,
  ): ResponseDTO<T> {
    return new ResponseDTO<T>(true, message, statusCode, responseObject);
  }

  static failure<T>(
    message: string,
    responseObject?: T,
    statusCode: number = HttpStatus.BAD_REQUEST,
  ): ResponseDTO<T> {
    return new ResponseDTO<T>(false, message, statusCode, responseObject);
  }
}
