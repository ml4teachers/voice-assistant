import { create } from "zustand";
import { persist } from "zustand/middleware"; // Optional: Use persist if state should survive refreshes

type SocraticDialogueState = 'idle' | 'retrieving_context' | 'ready_to_ask' | 'waiting_for_user' | 'evaluating';

interface SocraticStoreState {
  isSocraticModeActive: boolean;
  setIsSocraticModeActive: (active: boolean) => void;
  currentSocraticTopic: string | null;
  setCurrentSocraticTopic: (topic: string | null) => void;
  retrievedSocraticContext: string | null;
  setRetrievedSocraticContext: (context: string | null) => void;
  socraticDialogueState: SocraticDialogueState;
  setSocraticDialogueState: (state: SocraticDialogueState) => void;
}

const useSocraticStore = create<SocraticStoreState>()(
  // persist( // Uncomment if persistence is desired
    (set) => ({
      isSocraticModeActive: false,
      setIsSocraticModeActive: (active) => set({ isSocraticModeActive: active }),
      currentSocraticTopic: null,
      setCurrentSocraticTopic: (topic) => set({ currentSocraticTopic: topic }),
      retrievedSocraticContext: null,
      setRetrievedSocraticContext: (context) => set({ retrievedSocraticContext: context }),
      socraticDialogueState: 'idle',
      setSocraticDialogueState: (state) => set({ socraticDialogueState: state }),
    }),
    /* {
      name: "socratic-store", // Name for local storage persistence
    } */
  // ) // Uncomment if persistence is desired
);

export default useSocraticStore;
