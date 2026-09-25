import type { RuntimeFeeling } from "../../main/runtime-state";

const EXPRESSION_BY_FEELING: Record<RuntimeFeeling, string> = {
  平静: "expression00",
  开心: "expression4",
  温柔: "expression00",
  激动: "expression00",
  撒娇: "expression00",
  担心: "expression00",
  难过: "expression00",
  感动: "expression4",
  害羞: "expression10",
};

export function moodExpression(feeling: string): string | undefined {
  return Object.hasOwn(EXPRESSION_BY_FEELING, feeling)
    ? EXPRESSION_BY_FEELING[feeling as RuntimeFeeling]
    : undefined;
}
