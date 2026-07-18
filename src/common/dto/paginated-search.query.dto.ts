import { IntersectionType } from "@nestjs/swagger";
import { PaginationQueryDTO } from "./paginated-query.dto";
import { SearchDTO } from "./search.dto";

export class PaginatedSearchQueryDTO extends IntersectionType(
  SearchDTO,
  PaginationQueryDTO,
) {}
