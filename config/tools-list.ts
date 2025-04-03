// List of tools available to the assistant
// No need to include the top-level wrapper object as it is added in lib/tools/tools.ts
// More information on function calling: https://platform.openai.com/docs/guides/function-calling

export const toolsList = [
  {
    name: "get_weather",
    description: "Get the weather for a given location",
    parameters: {
      location: {
        type: "string",
        description: "Location to get weather for",
      },
      unit: {
        type: "string",
        description: "Unit to get weather in",
        enum: ["celsius", "fahrenheit"],
      },
    },
  },
  {
    name: "get_joke",
    description: "Get a programming joke",
    parameters: {},
  },
  // Add the file search wrapper function definition
  {
    name: "file_search_wrapper",
    description: "Searches the user's knowledge base (uploaded files) for information relevant to the query.",
    parameters: {
        query: {
            type: "string",
            description: "The specific query or question to search for in the user's files."
        }
        // Optional: Add other parameters the wrapper might need
    },
  },
  // Add the web search wrapper function definition
  {
    name: "web_search_wrapper",
    description: "Searches the web for information relevant to the user's query.",
    parameters: {
        query: {
            type: "string",
            description: "The specific query or question to search the web for."
        }
        // Optional: Add location parameters if your backend wrapper uses them
        // location: { type: "string", description: "User's location (e.g., city, country) for localized results", required: false }
    },
  }
];
