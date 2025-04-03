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

  // Remove the previous explicit web_search function tool
  /*
  if (webSearchEnabled) {
    tools.push({
      type: "function",
      name: "web_search",
      description: "Search the web for relevant information.",
      parameters: { // Example parameters (adjust as needed based on actual implementation)
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" }
        },
        required: ["query"],
      }
    });
  }
  */

  // --- Add web_search_wrapper function if enabled --- 
  if (webSearchEnabled) {
    const webSearchWrapperToolDef = toolsList.find(t => t.name === 'web_search_wrapper');
    if (webSearchWrapperToolDef) {
      tools.push({ // Add the wrapper function as a standard function tool
        type: "function",
        name: webSearchWrapperToolDef.name,
        description: webSearchWrapperToolDef.description,
        parameters: { // Ensure correct parameter structure
          type: "object",
          properties: webSearchWrapperToolDef.parameters as Record<string, ToolParameterProperty>,
          required: Object.keys(webSearchWrapperToolDef.parameters),
        },
      } as Tool);
    } else {
      console.warn("web_search_wrapper definition not found in tools-list.ts");
    }
  }
  // ---------------------------------------------------

  // Add the file_search_wrapper function if enabled
  if (fileSearchEnabled) {
    const fileSearchWrapperToolDef = toolsList.find(t => t.name === 'file_search_wrapper');
    if (fileSearchWrapperToolDef) {
      tools.push({
        type: "function",
        name: fileSearchWrapperToolDef.name,
        description: fileSearchWrapperToolDef.description,
        parameters: {
          type: "object",
          properties: fileSearchWrapperToolDef.parameters as Record<string, ToolParameterProperty>,
          required: Object.keys(fileSearchWrapperToolDef.parameters),
        },
      } as Tool);
    } else {
      console.warn("file_search_wrapper definition not found in tools-list.ts");
    }
  }

  // Filter the main toolsList to exclude file_search_wrapper AND web_search_wrapper
  const filteredToolsList = functionsEnabled 
    ? toolsList.filter(t => t.name !== 'file_search_wrapper' && t.name !== 'web_search_wrapper') 
    : [];

  if (functionsEnabled) {
    tools.push(
      ...filteredToolsList.map((toolDef): Tool => ({
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

  console.log("Generated Realtime API Tools (v8 - file_search_wrapper function):", tools);
  return tools;
};
