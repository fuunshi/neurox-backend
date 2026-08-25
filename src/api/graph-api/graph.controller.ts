import { GraphService } from "@/application/graph/graph.service";
import type { KnowledgeGraphResponseDTO } from "@/application/graph/dto/graph.dto";
import { AuthenticatedRequest } from "@/common/types/request.type";
import { Controller, Get, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

@ApiTags("Graph")
@ApiBearerAuth()
@Controller("graph")
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  @Get("knowledge")
  @ApiOperation({
    summary: "The reader's material as a graph",
    description:
      "Nodes are the reader's own sources and decks, plus a placeholder term " +
      "layer, and the edges between sources and decks are real generation " +
      "provenance. The response carries `placeholder: true` while the terms " +
      "are synthetic, so a client can label them as such rather than " +
      "presenting a guess as a finding.",
  })
  @ApiResponse({ status: 200 })
  async knowledge(
    @Req() req: AuthenticatedRequest,
  ): Promise<KnowledgeGraphResponseDTO> {
    return this.graphService.getGraph(req.authContext.user.id);
  }
}
