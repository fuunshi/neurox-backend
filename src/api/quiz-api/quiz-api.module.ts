import { QuizApplicationModule } from "@/application/quiz/quiz.module";
import { Module } from "@nestjs/common";
import { QuizController } from "./quiz.controller";

@Module({
  imports: [QuizApplicationModule],
  controllers: [QuizController],
})
export class QuizApiModule {}
