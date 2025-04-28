import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import useToolsStore from '../stores/useToolsStore';
import useSocraticStore from '../stores/useSocraticStore';
import { useSessionControlStore } from '../stores/useSessionControlStore';
import { HelpCircle } from 'lucide-react';

interface OnboardingDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingDialog: React.FC<OnboardingDialogProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState(1);
  const [participantId, setParticipantId] = useState('');
  const [consent1Checked, setConsent1Checked] = useState(false);
  const [consent2Checked, setConsent2Checked] = useState(false);
  // Korrigiere initialen Wert auf 'Tutoring' (statt 'Socratic')
  const [selectedMode, setSelectedMode] = useState<'Tutoring' | 'Assessment'>('Tutoring');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedPredefinedKey, setSelectedPredefinedKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fehler/Step aus Store lesen
  const onboardingErrorMessage = useSessionControlStore((state) => state.onboardingErrorMessage);
  const forceOnboardingStep = useSessionControlStore((state) => state.forceOnboardingStep);
  const clearForcedStep = useSessionControlStore((state) => state.clearForcedStep);
  const setOnboardingError = useSessionControlStore((state) => state.setOnboardingError);

  // Step-Steuerung bei Dialog-Öffnung/forceStep
  useEffect(() => {
    if (isOpen) {
      if (forceOnboardingStep !== null) {
        console.log(`[OnboardingDialog] Force opening step ${forceOnboardingStep}`);
        setStep(forceOnboardingStep);
        clearForcedStep();
        // Wenn explizit Schritt 1 erzwungen wird, alle lokalen States zurücksetzen
        if (forceOnboardingStep === 1) {
          setParticipantId('');
          setConsent1Checked(false);
          setConsent2Checked(false);
          setSelectedMode('Tutoring');
          setSelectedTopic('');
          setSelectedPredefinedKey('');
        }
      } else {
        setStep(1);
      }
    }
  }, [isOpen, forceOnboardingStep, clearForcedStep]);

  // vectorStoreId richtig auslesen
  const vectorStoreId = useToolsStore((s) => s.vectorStore?.id);
  const { setCurrentSocraticTopic, setSelectedSocraticMode, setIsSocraticModeActive, setGeneratedSocraticPrompt } = useSocraticStore();

  // Vordefinierte Themen/Fragen für Tutoring und Assessment
  const tutoringTopics = [
    { key: 'tutoring_wwi', label: 'Die Rolle der Schweiz im Ersten Weltkrieg (1914-1918)' },
    { key: 'tutoring_interwar_radicalization', label: 'Radikalisierung in der Zwischenkriegszeit' },
    { key: 'tutoring_wwii_refugee', label: 'Schweizer Flüchtlingspolitik im Zweiten Weltkrieg' },
    { key: 'custom', label: 'Eigenes Thema eingeben...' }
  ];

  const assessmentTopics = [
    { key: 'assessment_landesstreik', label: 'Landesstreik 1918: Faktoren und Reaktionen?' },
    { key: 'assessment_interwar_crisis', label: 'Einfluss der Weltwirtschaftskrise in den 1930er Jahren?' },
    { key: 'assessment_border_closure', label: 'Grenzschliessung 1942: Hintergründe und Folgen?' },
    { key: 'custom', label: 'Eigene Frage/Thema...' }
  ];

  const allPredefinedTopics = [...tutoringTopics, ...assessmentTopics].reduce((acc, topic) => {
    if (topic.key !== 'custom') {
      acc[topic.key] = topic.label;
    }
    return acc;
  }, {} as Record<string, string>);

  // Step 1: Intro
  const renderStep1 = () => (
    <>
      <DialogHeader>
        <DialogTitle>Vielen Dank für Ihre Teilnahme!</DialogTitle>
      </DialogHeader>
      <div className="py-4">
        <p>Bevor das Gespräch mit dem KI-Lernpartner beginnt, benötigen wir noch Ihre digitale Bestätigung und Ihr Gesprächsthema.</p>
        <p className="mt-4 text-sm text-muted-foreground">(Bei Fragen nutzen Sie bitte den <HelpCircle size={16} className="inline-block align-text-bottom" /> Hilfe-Button oben.)</p>
      </div>
      <DialogFooter>
        <Button onClick={() => setStep(2)}>Weiter</Button>
      </DialogFooter>
    </>
  );

  // Step 2: Consent
  const renderStep2 = () => (
    <>
      <DialogHeader>
        <DialogTitle>Einwilligung & ID-Code</DialogTitle>
      </DialogHeader>
      <div className="py-2">
        <Input
          placeholder="ID-Code"
          value={participantId}
          onChange={e => setParticipantId(e.target.value)}
        />
        <div className="flex items-center mt-4">
          <Checkbox id="consent1" checked={consent1Checked} onCheckedChange={v => setConsent1Checked(!!v)} />
          <label htmlFor="consent1" className="ml-2">Ich habe die Hinweise gelesen und bin einverstanden.</label>
        </div>
        <div className="flex items-center mt-2">
          <Checkbox id="consent2" checked={consent2Checked} onCheckedChange={v => setConsent2Checked(!!v)} />
          <label htmlFor="consent2" className="ml-2">Meine Daten dürfen für Forschungszwecke verwendet werden.</label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button
          onClick={() => setStep(3)}
          disabled={!participantId || !consent1Checked || !consent2Checked}
        >Weiter</Button>
      </DialogFooter>
    </>
  );

  // Step 3: Config
  const renderStep3 = () => {
    // Themenliste je nach Modus
    const topicOptions = selectedMode === 'Tutoring' ? tutoringTopics : assessmentTopics;
    return (
      <>
        <DialogHeader>
          <DialogTitle>Konfiguration</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <div className="mb-4">
            <label className="block mb-1">Modus</label>
            <Select value={selectedMode} onValueChange={v => {
              setSelectedMode(v as 'Tutoring' | 'Assessment');
              setSelectedPredefinedKey(''); // Reset bei Moduswechsel
              setSelectedTopic('');
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Tutoring">Lerngespräch</SelectItem>
                <SelectItem value="Assessment">Testgespräch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mb-4">
            <label className="block mb-1">Vordefiniertes Thema/Frage wählen oder eigene Eingabe</label>
            <Select value={selectedPredefinedKey} onValueChange={v => {
              setSelectedPredefinedKey(v);
              if (v !== 'custom') setSelectedTopic('');
            }}>
              <SelectTrigger><SelectValue placeholder="Bitte wählen..." /></SelectTrigger>
              <SelectContent>
                {topicOptions.map(item => (
                  <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedPredefinedKey === 'custom' && (
            <div className="mt-4">
              <label className="block mb-1">Eigenes Thema / Eigene Frage</label>
              <Input
                placeholder="Eigenes Thema/Frage eingeben..."
                value={selectedTopic}
                onChange={e => setSelectedTopic(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setStep(2)}>Zurück</Button>
          <Button
            onClick={handlePrepareSession}
            disabled={
              !selectedMode ||
              !selectedPredefinedKey ||
              (selectedPredefinedKey === 'custom' && !selectedTopic)
            }
          >Vorbereiten</Button>
        </DialogFooter>
      </>
    );
  };

  // Step 4: Loading
  const renderStep4 = () => (
    <>
      <DialogHeader>
        <DialogTitle>Vorbereitung läuft…</DialogTitle>
      </DialogHeader>
      <div className="py-2">
      <p>Bitte warten...</p>
      <p className="mt-4 text-sm text-muted-foreground">(Der Prozess kann bis zu einer Minute dauern.)</p>
      </div>
    </>
  );

  // Step 5: Final Start
  const renderStep5 = () => (
    <>
      <DialogHeader>
        <DialogTitle>Letzter Schritt: Bildschirmfreigabe</DialogTitle>
      </DialogHeader>
      <div className="py-4 flex flex-col items-center">
        {onboardingErrorMessage && (
          <p className="text-red-500 font-medium mb-3 text-center">{onboardingErrorMessage}</p>
        )}
        <video
          src="/screen-share-guide.mp4"
          controls
          autoPlay
          loop
          muted
          className="w-full rounded-lg shadow mb-4"
          style={{ background: '#000' }}
        />
        <p className="mb-2 text-base">
          <strong>WICHTIG:</strong> Für die Studie muss der gesamte Bildschirm geteilt werden. Klicken Sie gleich auf <b>'OK &amp; Freigabe starten'</b>, wählen Sie dann im Browser-Fenster den Tab <b>'Gesamter Bildschirm'</b>, klicken Sie auf die Bildschirsvorschau und dann auf <b>'Teilen'</b>.
        </p>
      </div>
      <DialogFooter>
        <Button onClick={handleTriggerScreenShareAndStart}>OK &amp; Freigabe starten</Button>
      </DialogFooter>
    </>
  );

  async function handlePrepareSession() {
    setIsLoading(true);
    setError(null);
    setStep(4);
    try {
      let requestBody: any = {
        mode: selectedMode,
        vectorStoreId,
        participantId,
      };
      if (selectedPredefinedKey === 'custom') {
        requestBody.topic = selectedTopic;
      } else {
        requestBody.predefinedKey = selectedPredefinedKey;
      }
      const res = await fetch('/api/socratic/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) throw new Error('Fehler bei der Vorbereitung');
      const data = await res.json();
      // Topic für Store korrekt setzen
      const topicForStore = selectedPredefinedKey === 'custom'
        ? selectedTopic
        : allPredefinedTopics[selectedPredefinedKey] || selectedPredefinedKey;
      setCurrentSocraticTopic(topicForStore);
      setSelectedSocraticMode(selectedMode);
      setGeneratedSocraticPrompt(data.socraticPrompt);
      setIsSocraticModeActive(true);
      setStep(5);
    } catch (e: any) {
      setError(e.message || 'Unbekannter Fehler');
      setStep(3);
    } finally {
      setIsLoading(false);
    }
  }

  // Entferne handleFinalStart und ersetze durch neue Funktion
  const handleTriggerScreenShareAndStart = () => {
    setOnboardingError(null); // Fehler im Store löschen
    console.log("[OnboardingDialog] Triggering final start sequence (requesting start via store).");

    // Korrektes Thema für den Store ermitteln
    const finalTopic = selectedPredefinedKey === 'custom'
        ? selectedTopic
        : allPredefinedTopics[selectedPredefinedKey] || selectedPredefinedKey; // Label oder Key als Fallback

    // Startanfrage über den Store senden (dies löst den Prozess in RealtimeChat aus)
    useSessionControlStore.getState().requestStartFromOnboarding({
        participantId,
        topic: finalTopic, // Verwende das ermittelte Thema
        mode: selectedMode,
    });

    // Dialog schliessen (wird von aussen gesteuert durch Store/prop)
    onClose();
};

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        {error && <div className="text-red-500 mb-2">{error}</div>}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </DialogContent>
    </Dialog>
  );
};

// Typdefinition für SocraticMode sicherstellen
type SocraticMode = 'Assessment' | 'Tutoring';
const allowedModes: readonly SocraticMode[] = ['Assessment', 'Tutoring'] as const;
