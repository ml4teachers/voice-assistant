import { create } from "zustand";
import { persist } from "zustand/middleware"; // Optional: Use persist if state should survive refreshes

type SocraticMode = 'Assessment' | 'Tutoring'; // Add other modes later if needed

// Interface for the parsed JSON evaluation from the LLM
export interface SocraticEvaluation {
    evaluation: string;
    matched_expectations: string[];
    triggered_misconceptions: string[];
    follow_up_question: string;
    // Add other potential fields if the LLM provides them
}

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

  // --- NEU: EMT/LCC Light State ---
  sessionExpectations: string[]; // Parsed from generated prompt
  setSessionExpectations: (expectations: string[]) => void;
  sessionMisconceptions: string[]; // Parsed from generated prompt
  setSessionMisconceptions: (misconceptions: string[]) => void;
  currentTurnEvaluation: SocraticEvaluation | null; // Last evaluation JSON from LLM
  setCurrentTurnEvaluation: (evaluation: SocraticEvaluation | null) => void;
  coveredExpectations: string[]; // Accumulates matched expectations over session
  addCoveredExpectation: (expectation: string) => void;
  encounteredMisconceptions: string[]; // Accumulates triggered misconceptions over session
  addEncounteredMisconception: (misconception: string) => void;
  // --- Ende Neu ---
}

const useSocraticStore = create<SocraticState>()(
  // persist( // Uncomment if persistence is desired
    (set, get) => ({
      isSocraticModeActive: false,
      setIsSocraticModeActive: (isActive) => {
        console.log(`[SocraticStore] setIsSocraticModeActive called with: ${isActive}`);
        set((state) => {
          const shouldReset = state.isSocraticModeActive !== isActive;
          if (!isActive && shouldReset) {
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
              // Reset new EMT states
              sessionExpectations: [],
              sessionMisconceptions: [],
              currentTurnEvaluation: null,
              coveredExpectations: [],
              encounteredMisconceptions: [],
            };
          } else if (isActive && shouldReset) {
             console.log("[SocraticStore] Activating Socratic mode.");
             return { 
                 isSocraticModeActive: true, 
                 // Reset previous session data but keep mode active
                 currentSocraticTopic: null,
                 selectedSocraticMode: null,
                 retrievedSocraticContext: null,
                 generatedSocraticPrompt: null,
                 socraticOpenerQuestion: null,
                 isGeneratingPrompt: false,
                 socraticDialogueState: 'idle',
                 sessionExpectations: [],
                 sessionMisconceptions: [],
                 currentTurnEvaluation: null,
                 coveredExpectations: [],
                 encounteredMisconceptions: [],
             }; 
          }
          // No change if isActive is the same as state.isSocraticModeActive
          return state;
        });
      },

      currentSocraticTopic: null,
      setCurrentSocraticTopic: (topic) => {
        console.log(`[SocraticStore] setCurrentSocraticTopic called with: ${topic}`);
        set((state) => {
          // Only update if topic actually changes
          if (state.currentSocraticTopic !== topic) {
            console.log("[SocraticStore] Topic changed, resetting context, prompt, opener, evaluation, and state.");
            return {
              currentSocraticTopic: topic,
              retrievedSocraticContext: null,
              generatedSocraticPrompt: null,
              socraticOpenerQuestion: null,
              socraticDialogueState: topic ? 'generating_prompt' : 'idle', // Start generating prompt immediately if topic set
              // Reset EMT state on topic change
              sessionExpectations: [], 
              sessionMisconceptions: [],
              currentTurnEvaluation: null,
              coveredExpectations: [], 
              encounteredMisconceptions: [],
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

      // --- NEU: Initialisierung und Setter für EMT/LCC Light ---
      sessionExpectations: [],
      setSessionExpectations: (expectations) => {
        console.log(`[SocraticStore] setSessionExpectations called with:`, expectations);
        set({ sessionExpectations: expectations });
      },
      sessionMisconceptions: [],
      setSessionMisconceptions: (misconceptions) => {
        console.log(`[SocraticStore] setSessionMisconceptions called with:`, misconceptions);
        set({ sessionMisconceptions: misconceptions });
      },
      currentTurnEvaluation: null,
      setCurrentTurnEvaluation: (evaluation) => {
        console.log(`[SocraticStore] setCurrentTurnEvaluation called with:`, evaluation);
        set({ currentTurnEvaluation: evaluation });
      },
      coveredExpectations: [],
      addCoveredExpectation: (expectation) => {
        console.log(`[SocraticStore] addCoveredExpectation called with: ${expectation}`);
        set((state) => ({
          coveredExpectations: state.coveredExpectations.includes(expectation) 
            ? state.coveredExpectations 
            : [...state.coveredExpectations, expectation]
        }));
      },
      encounteredMisconceptions: [],
      addEncounteredMisconception: (misconception) => {
        console.log(`[SocraticStore] addEncounteredMisconception called with: ${misconception}`);
        set((state) => ({
          encounteredMisconceptions: state.encounteredMisconceptions.includes(misconception) 
            ? state.encounteredMisconceptions 
            : [...state.encounteredMisconceptions, misconception]
        }));
      },
      // --- Ende Neu ---
    }),
    /* {
      name: "socratic-store", // Name for local storage persistence
    } */
  // ) // Uncomment if persistence is desired
);

export default useSocraticStore;
