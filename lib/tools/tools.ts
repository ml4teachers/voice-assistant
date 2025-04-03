import { toolsList } from "@/config/tools-list";
import useToolsStore from "@/stores/useToolsStore";
import { Tool, ToolParameterProperty } from "@/components/realtime-types";

export const getTools = (): Tool[] => {
  const {
    webSearchEnabled,
    fileSearchEnabled,
    functionsEnabled,
  } = useToolsStore.getState();

  const tools: Tool[] = [];

  if (webSearchEnabled) {
    tools.push({
      type: "function",
      name: "web_search",
      description: "Search the web for relevant information.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" }
        },
        required: ["query"],
      }
    });
  }

  if (fileSearchEnabled) {
    tools.push({
      type: "function",
      name: "file_search",
      description: "Search the user's uploaded files.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query for files" }
        },
        required: ["query"],
      }
    });
  }

  if (functionsEnabled) {
    tools.push(
      ...toolsList.map((toolDef): Tool => ({
        type: "function",
        name: toolDef.name,
        description: toolDef.description,
        parameters: {
          type: "object",
          properties: toolDef.parameters as Record<string, ToolParameterProperty>,
          required: Object.keys(toolDef.parameters),
        },
      }))
    );
  }

  console.log("Generated Realtime API Tools:", tools);
  return tools;
};
