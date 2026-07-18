import { MongoAbility, AbilityTuple } from "@casl/ability";
import { Action } from "./actions.enum";
import { Subjects } from "./subjects";

export type AppAbility = MongoAbility<[Action, Subjects]>;
