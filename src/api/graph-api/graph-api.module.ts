import { GraphApplicationModule } from "@/application/graph/graph.module";
import { Module } from "@nestjs/common";
import { GraphController } from "./graph.controller";

@Module({
  imports: [GraphApplicationModule],
  controllers: [GraphController],
})
export class GraphApiModule {}
