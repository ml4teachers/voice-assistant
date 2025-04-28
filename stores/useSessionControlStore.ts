import { create } from 'zustand';

interface SessionControlState {
  startRequestConfig: { participantId: string; topic: string; mode: string } | null;
  directStartRequested: boolean;
  showOnboardingDialog: boolean;
  onboardingErrorMessage: string | null; // Für Fehler im Dialog
  forceOnboardingStep: number | null;   // Um Dialog bei bestimmtem Schritt zu öffnen
  requestStartFromOnboarding: (config: { participantId: string; topic: string; mode: string }) => void;
  requestDirectStart: () => void;
  clearStartRequest: () => void;
  openOnboarding: (targetStep?: number) => void;
  closeOnboarding: () => void;
  setOnboardingError: (message: string | null) => void;
  clearForcedStep: () => void;
  setForceOnboardingStep: (step: number) => void;
}

export const useSessionControlStore = create<SessionControlState>((set) => ({
  startRequestConfig: null,
  directStartRequested: false,
  showOnboardingDialog: false,
  onboardingErrorMessage: null,
  forceOnboardingStep: null,
  setOnboardingError: (message) => set({ onboardingErrorMessage: message }),
  clearForcedStep: () => set({ forceOnboardingStep: null }),
  requestStartFromOnboarding: (config) => set({
    startRequestConfig: config,
    showOnboardingDialog: false,
    directStartRequested: false
  }),
  requestDirectStart: () => set({
    directStartRequested: true,
    showOnboardingDialog: false,
    startRequestConfig: null
  }),
  clearStartRequest: () => set({
    startRequestConfig: null,
    directStartRequested: false,
    onboardingErrorMessage: null,
    forceOnboardingStep: null
  }),
  openOnboarding: (targetStep = 1) => set({
    showOnboardingDialog: true,
    startRequestConfig: null,
    directStartRequested: false,
    onboardingErrorMessage: null,
    forceOnboardingStep: targetStep
  }),
  closeOnboarding: () => set({
    showOnboardingDialog: false,
    onboardingErrorMessage: null,
    forceOnboardingStep: null
  }),
  setForceOnboardingStep: (step) => set({ forceOnboardingStep: step }),
}));
