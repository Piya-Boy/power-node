import Handlebars from "handlebars";
import type { NodeExecutor } from "../../types";

interface IfConditionData {
  variableName?: string;
  field?: string;
  operator?: string;
  value?: string;
}

function evaluateCondition(fieldValue: unknown, operator: string, compareValue: string): boolean {
  const strFieldValue = String(fieldValue ?? "");

  switch (operator) {
    case "equals":
      return strFieldValue === compareValue;
    case "not_equals":
      return strFieldValue !== compareValue;
    case "contains":
      return strFieldValue.includes(compareValue);
    case "not_contains":
      return !strFieldValue.includes(compareValue);
    case "greater_than":
      return Number(fieldValue) > Number(compareValue);
    case "less_than":
      return Number(fieldValue) < Number(compareValue);
    case "is_empty":
      return strFieldValue === "" || fieldValue === null || fieldValue === undefined;
    case "is_not_empty":
      return strFieldValue !== "" && fieldValue !== null && fieldValue !== undefined;
    case "starts_with":
      return strFieldValue.startsWith(compareValue);
    case "ends_with":
      return strFieldValue.endsWith(compareValue);
    default:
      return false;
  }
}

export const ifConditionExecutor: NodeExecutor<IfConditionData> = async ({
  data,
  context,
}) => {
  const { variableName = "ifResult", field = "", operator = "equals", value = "" } = data;

  // Compile field template with context
  const compiledField = Handlebars.compile(field)(context);
  const result = evaluateCondition(compiledField, operator, value);

  return {
    ...context,
    [variableName]: {
      result,
      field: compiledField,
      operator,
      value,
    },
  };
};
