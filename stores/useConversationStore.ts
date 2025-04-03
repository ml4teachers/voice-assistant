import { create } from "zustand";
import { Item, MessageItem, ToolCallItem } from "@/hooks/useHandleRealtimeEvents";
import { INITIAL_MESSAGE } from "@/config/constants";

interface ConversationState {
  chatMessages: Item[];
  setChatMessages: (items: Item[]) => void;
  addChatMessage: (item: Item) => void;
  rawSet: (state: Partial<ConversationState>) => void;
}

const useConversationStore = create<ConversationState>((set, get) => ({
  chatMessages: [
    {
      type: "message", role: "assistant", id: 'initial-msg-0',
      content: [{ type: "output_text", text: INITIAL_MESSAGE }],
    } as MessageItem,
  ],

  setChatMessages: (items) => set({ chatMessages: items }),

  addChatMessage: (item) =>
    set((state) => {
        if (item.id && state.chatMessages.some(msg => msg.id === item.id)) {
            return state;
        }
        return { chatMessages: [...state.chatMessages, item] };
    }),

  rawSet: (newState) => set(newState),
}));

export default useConversationStore;
