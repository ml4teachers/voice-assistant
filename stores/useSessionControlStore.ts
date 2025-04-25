import { create } from 'zustand';

interface SessionControlState {
  startRequestConfig: { participantId: string; topic: string; mode: string } | null;
  directStartRequested: boolean;
  showOnboardingDialog: boolean;
  requestStartFromOnboarding: (config: { participantId: string; topic: string; mode: string }) => void;
  requestDirectStart: () => void;
  clearStartRequest: () => void;
  openOnboarding: () => void;
  closeOnboarding: () => void;
}

export const useSessionControlStore = create<SessionControlState>((set) => ({
  startRequestConfig: null,
  directStartRequested: false,
  showOnboardingDialog: false,
  requestStartFromOnboarding: (config) => set({ startRequestConfig: config, showOnboardingDialog: false, directStartRequested: false }),
  requestDirectStart: () => set({ directStartRequested: true, showOnboardingDialog: false, startRequestConfig: null }),
  clearStartRequest: () => set({ startRequestConfig: null, directStartRequested: false }),
  openOnboarding: () => set({ showOnboardingDialog: true, startRequestConfig: null, directStartRequested: false }),
  closeOnboarding: () => set({ showOnboardingDialog: false }),
}));
