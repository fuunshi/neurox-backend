/**
 * Client-facing messages for the MikroORM driver exceptions that are mapped to
 * HTTP responses. Each key names the case the driver reported; see
 * `handleDatabaseError` (`common/utils/error/handler/database.handler.ts`) and
 * `GlobalExceptionFilter` for the exception -> key -> status mapping.
 */
export const DATABASE_ERROR_MESSAGES = {
  UNIQUE_CONSTRAINT_VIOLATION: "A record with this value already exists",
  FOREIGN_KEY_CONSTRAINT_VIOLATION: "Invalid foreign key reference",
  NOT_NULL_CONSTRAINT_VIOLATION: "A required field is missing",
  CHECK_CONSTRAINT_VIOLATION: "A value failed a database constraint check",
  INVALID_FIELD_NAME: "Database schema mismatch: invalid field name",
  DRIVER_ERROR: "Database error occurred",
} as const;

export type DatabaseErrorKey = keyof typeof DATABASE_ERROR_MESSAGES;
