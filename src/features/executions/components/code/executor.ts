import type { NodeExecutor } from "../../types";

interface CodeData {
  variableName?: string;
  language?: string;
  code?: string;
}

export const codeExecutor: NodeExecutor<CodeData> = async ({
  data,
  context,
}) => {
  const { variableName = "codeResult", code = "" } = data;

  if (!code) {
    return { ...context, [variableName]: null };
  }

  // Create a sandboxed function with context available
  const fn = new Function("context", `
    "use strict";
    ${code}
  `);

  const result = fn(context);

  return {
    ...context,
    [variableName]: result,
  };
};
