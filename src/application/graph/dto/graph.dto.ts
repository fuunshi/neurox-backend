import { ApiProperty } from "@nestjs/swagger";

/** What a node in the knowledge graph represents. */
export const GRAPH_NODE_TYPE = {
  SOURCE: "SOURCE",
  DECK: "DECK",
  TERM: "TERM",
} as const;

export type GraphNodeType =
  (typeof GRAPH_NODE_TYPE)[keyof typeof GRAPH_NODE_TYPE];

/** What an edge means. */
export const GRAPH_EDGE_TYPE = {
  /** A deck's cards were drafted from this source. */
  GENERATED_FROM: "GENERATED_FROM",
  /** A term the material covers, and the deck that covers it. */
  COVERS: "COVERS",
} as const;

export type GraphEdgeType =
  (typeof GRAPH_EDGE_TYPE)[keyof typeof GRAPH_EDGE_TYPE];

export class GraphNodeDTO {
  @ApiProperty({ description: "Stable within one response." })
  id!: string;

  @ApiProperty({ enum: Object.values(GRAPH_NODE_TYPE) })
  type!: GraphNodeType;

  @ApiProperty()
  label!: string;

  @ApiProperty({
    description:
      "Relative importance, 0–1. Drives node size so the graph's shape is " +
      "readable before any label is.",
  })
  weight!: number;
}

export class GraphEdgeDTO {
  @ApiProperty() source!: string;
  @ApiProperty() target!: string;

  @ApiProperty({ enum: Object.values(GRAPH_EDGE_TYPE) })
  type!: GraphEdgeType;

  @ApiProperty({ description: "Relative strength, 0–1." })
  weight!: number;
}

export class KnowledgeGraphResponseDTO {
  @ApiProperty({ type: [GraphNodeDTO] })
  nodes!: GraphNodeDTO[];

  @ApiProperty({ type: [GraphEdgeDTO] })
  edges!: GraphEdgeDTO[];

  @ApiProperty({
    description:
      "True while the term layer is synthetic. The source and deck nodes and " +
      "the edges between them are real; the terms bridging decks are not, and " +
      "a client that draws them should be able to say so.",
  })
  placeholder!: boolean;
}
