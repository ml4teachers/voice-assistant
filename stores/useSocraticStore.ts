import { create } from "zustand";
import { persist } from "zustand/middleware"; // Optional: Use persist if state should survive refreshes

type SocraticMode = 'Assessment' | 'Tutoring'; // Add other modes later if needed

interface SocraticState {
  isSocraticModeActive: boolean;
  setIsSocraticModeActive: (isActive: boolean) => void;

  currentSocraticTopic: string | null;
  setCurrentSocraticTopic: (topic: string | null) => void;

  selectedSocraticMode: SocraticMode | null;
  setSelectedSocraticMode: (mode: SocraticMode | null) => void;

  retrievedSocraticContext: string | null; // Context fetched for the topic
  setRetrievedSocraticContext: (context: string | null) => void;

  generatedSocraticPrompt: string | null; // The final prompt for the Realtime API
  setGeneratedSocraticPrompt: (prompt: string | null) => void;

  isGeneratingPrompt: boolean; // Loading state
  setIsGeneratingPrompt: (isLoading: boolean) => void;

  socraticDialogueState: string;
  setSocraticDialogueState: (state: string) => void;

  // Optional: Add states for scoring/EMT later
}

const useSocraticStore = create<SocraticState>()(
  // persist( // Uncomment if persistence is desired
    (set) => ({
      isSocraticModeActive: false,
      setIsSocraticModeActive: (isActive) => {
        console.log(`[SocraticStore] setIsSocraticModeActive called with: ${isActive}`);
        set((state) => {
          // Only reset if changing state
          const shouldReset = state.isSocraticModeActive !== isActive;
          return {
            isSocraticModeActive: isActive,
            // Reset other states only when deactivating
            currentSocraticTopic: !isActive && shouldReset ? null : state.currentSocraticTopic,
            selectedSocraticMode: !isActive && shouldReset ? null : state.selectedSocraticMode,
            retrievedSocraticContext: !isActive && shouldReset ? null : state.retrievedSocraticContext,
            generatedSocraticPrompt: !isActive && shouldReset ? null : state.generatedSocraticPrompt,
            isGeneratingPrompt: false, // Always reset loading state
            // Also reset dialogue state on deactivation
            socraticDialogueState: !isActive && shouldReset ? 'idle' : state.socraticDialogueState
          };
        });
      },

      currentSocraticTopic: null,
      setCurrentSocraticTopic: (topic) => {
        console.log(`[SocraticStore] setCurrentSocraticTopic called with: ${topic}`);
        set({ currentSocraticTopic: topic });
      },

      selectedSocraticMode: null,
      setSelectedSocraticMode: (mode) => {
        console.log(`[SocraticStore] setSelectedSocraticMode called with: ${mode}`);
        set({ selectedSocraticMode: mode });
      },

      retrievedSocraticContext: null,
      setRetrievedSocraticContext: (context) => {
        console.log(`[SocraticStore] setRetrievedSocraticContext called (length: ${context?.length})`);
        set({ retrievedSocraticContext: context });
      },

      generatedSocraticPrompt: null,
      setGeneratedSocraticPrompt: (prompt) => {
        console.log(`[SocraticStore] setGeneratedSocraticPrompt called (length: ${prompt?.length})`);
        set({ generatedSocraticPrompt: prompt });
      },

      isGeneratingPrompt: false,
      setIsGeneratingPrompt: (isLoading) => {
        console.log(`[SocraticStore] setIsGeneratingPrompt called with: ${isLoading}`);
        set({ isGeneratingPrompt: isLoading });
      },

      socraticDialogueState: 'idle', // Assuming initial state
      setSocraticDialogueState: (state) => {
        console.log(`[SocraticStore] setSocraticDialogueState called with: ${state}`);
        set({ socraticDialogueState: state });
      },
    }),
    /* {
      name: "socratic-store", // Name for local storage persistence
    } */
  // ) // Uncomment if persistence is desired
);

export default useSocraticStore;
