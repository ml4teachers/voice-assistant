import { create } from "zustand";
import { persist } from "zustand/middleware"; // Optional: Use persist if state should survive refreshes

type SocraticMode = 'Assessment' | 'Tutoring'; // Add other modes later if needed

// REMOVED: SocraticEvaluation Interface (no longer needed)
/*
export interface SocraticEvaluation {
    evaluation: string;
    matched_expectations: string[];
    triggered_misconceptions: string[];
    follow_up_question: string;
}
*/

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

  socraticOpenerQuestion: string | null; // The question shown to the user first
  setSocraticOpenerQuestion: (question: string | null) => void;

  isGeneratingPrompt: boolean; // Loading state
  setIsGeneratingPrompt: (isLoading: boolean) => void;

  socraticDialogueState: string;
  setSocraticDialogueState: (state: string) => void;

  // REMOVED: EMT/LCC Light State
  /*
  sessionExpectations: string[]; 
  setSessionExpectations: (expectations: string[]) => void;
  sessionMisconceptions: string[];
  setSessionMisconceptions: (misconceptions: string[]) => void;
  currentTurnEvaluation: SocraticEvaluation | null;
  setCurrentTurnEvaluation: (evaluation: SocraticEvaluation | null) => void;
  coveredExpectations: string[]; 
  addCoveredExpectation: (expectation: string) => void;
  encounteredMisconceptions: string[];
  addEncounteredMisconception: (misconception: string) => void;
  */
}

const useSocraticStore = create<SocraticState>()(
  // persist( // Uncomment if persistence is desired
    (set, get) => ({
      isSocraticModeActive: false,
      setIsSocraticModeActive: (isActive) => {
        console.log(`[SocraticStore] setIsSocraticModeActive called with: ${isActive}`);
        set((state) => {
          const shouldChange = state.isSocraticModeActive !== isActive;
          if (!shouldChange) return state; // No change needed

          if (!isActive) { // Deactivating
            console.log("[SocraticStore] Deactivating Socratic mode, resetting related state.");
            return {
              isSocraticModeActive: false,
              currentSocraticTopic: null,
              selectedSocraticMode: null,
              retrievedSocraticContext: null,
              generatedSocraticPrompt: null,
              socraticOpenerQuestion: null,
              isGeneratingPrompt: false,
              socraticDialogueState: 'idle',
              // REMOVED: Resetting EMT state
              /*
              sessionExpectations: [],
              sessionMisconceptions: [],
              currentTurnEvaluation: null,
              coveredExpectations: [],
              encounteredMisconceptions: [],
              */
            };
          } else { // Activating
             console.log("[SocraticStore] Activating Socratic mode (keeping existing topic/mode if set).");
             return { 
                 isSocraticModeActive: true,
                 // Keep existing core values
                 currentSocraticTopic: state.currentSocraticTopic, 
                 selectedSocraticMode: state.selectedSocraticMode,
                 retrievedSocraticContext: state.retrievedSocraticContext,
                 generatedSocraticPrompt: state.generatedSocraticPrompt,
                 socraticOpenerQuestion: state.socraticOpenerQuestion,
                 isGeneratingPrompt: state.isGeneratingPrompt, 
                 socraticDialogueState: state.socraticDialogueState, 
                 // REMOVED: Keeping EMT state (no longer exists)
             }; 
          }
        });
      },

      currentSocraticTopic: null,
      setCurrentSocraticTopic: (topic) => {
        console.log(`[SocraticStore] setCurrentSocraticTopic called with: ${topic}`);
        set((state) => {
          if (state.currentSocraticTopic !== topic) {
            console.log("[SocraticStore] Topic changed, resetting context, prompt, opener, and state.");
            return {
              currentSocraticTopic: topic,
              retrievedSocraticContext: null,
              generatedSocraticPrompt: null,
              socraticOpenerQuestion: null,
              socraticDialogueState: topic ? 'generating_prompt' : 'idle', // Keep this logic
              // REMOVED: Reset EMT state
            };
          } 
          return state; // No change if topic is the same
        });
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

      socraticOpenerQuestion: null,
      setSocraticOpenerQuestion: (question) => {
        console.log(`[SocraticStore] setSocraticOpenerQuestion called with: ${question}`);
        set({ socraticOpenerQuestion: question });
      },

      isGeneratingPrompt: false,
      setIsGeneratingPrompt: (isLoading) => {
        console.log(`[SocraticStore] setIsGeneratingPrompt called with: ${isLoading}`);
        set({ isGeneratingPrompt: isLoading });
      },

      socraticDialogueState: 'idle',
      setSocraticDialogueState: (state) => {
        console.log(`[SocraticStore] setSocraticDialogueState called with: ${state}`);
        set({ socraticDialogueState: state });
      },

      // REMOVED: Initialization and Setters for EMT/LCC Light
      /*
      sessionExpectations: [],
      setSessionExpectations: (expectations) => { ... },
      sessionMisconceptions: [],
      setSessionMisconceptions: (misconceptions) => { ... },
      currentTurnEvaluation: null,
      setCurrentTurnEvaluation: (evaluation) => { ... },
      coveredExpectations: [],
      addCoveredExpectation: (expectation) => { ... },
      encounteredMisconceptions: [],
      addEncounteredMisconception: (misconception) => { ... },
      */
    }),
    /* { name: "socratic-store" } */
  // ) // Uncomment if persistence is desired
);

export default useSocraticStore;
