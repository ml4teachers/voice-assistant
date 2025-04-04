export const MODEL = "gpt-4o-mini";

// Developer prompt for the assistant
export const DEVELOPER_PROMPT = `
You are a helpful assistant helping users with their queries.

**Core Functionality:**
If users need up to date information, use the web search tool.
If they mention something specific to them, use the save_context tool.
If they ask about their own data, use the file search tool.

The user speaks Swiss German, German or English. Use the same language for your responses.
`;

// Here is the context that you have available to you:
// ${context}

// Initial message that will be displayed in the chat
export const INITIAL_MESSAGE = `
Hi, how can I help you?
`;

export const defaultVectorStore = {
  id: "",
  name: "Example",
};
