import React, { useState } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wenn das Onboarding geöffnet wird, direkt zu Schritt 3 (Konfiguration) springen
  React.useEffect(() => {
    if (isOpen) setStep(3);
  }, [isOpen]);

  // vectorStoreId richtig auslesen
  const vectorStoreId = useToolsStore((s) => s.vectorStore?.id);
  const { setCurrentSocraticTopic, setSelectedSocraticMode, setIsSocraticModeActive, setGeneratedSocraticPrompt } = useSocraticStore();

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
  const renderStep3 = () => (
    <>
      <DialogHeader>
        <DialogTitle>Konfiguration</DialogTitle>
      </DialogHeader>
      <div className="py-2">
        <div className="mb-4">
          <label className="block mb-1">Modus</label>
          <Select value={selectedMode} onValueChange={v => setSelectedMode(v as 'Tutoring' | 'Assessment')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Tutoring">Lerngespräch</SelectItem>
              <SelectItem value="Assessment">Testgespräch</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mb-4">
          <label className="block mb-1">Thema</label>
          <Input
            placeholder="Thema eingeben"
            value={selectedTopic}
            onChange={e => setSelectedTopic(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={() => setStep(2)}>Zurück</Button>
        <Button
          onClick={handlePrepareSession}
          disabled={!selectedTopic || !selectedMode}
        >Vorbereiten</Button>
      </DialogFooter>
    </>
  );

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
        <DialogTitle>Fertig!</DialogTitle>
      </DialogHeader>
      <div className="py-4">Die Session ist vorbereitet. Sie können jetzt starten.</div>
      <DialogFooter>
        <Button onClick={handleFinalStart}>Session starten</Button>
      </DialogFooter>
    </>
  );

  async function handlePrepareSession() {
    setIsLoading(true);
    setError(null);
    setStep(4);
    try {
      const res = await fetch('/api/socratic/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          topic: selectedTopic,
          mode: selectedMode,
          vectorStoreId,
        }),
      });
      if (!res.ok) throw new Error('Fehler bei der Vorbereitung');
      const data = await res.json();
      // Reihenfolge korrigiert: Topic -> Mode -> Prompt -> Active
      setCurrentSocraticTopic(selectedTopic);
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

  function handleFinalStart() {
    // Delay, damit der Prompt sicher im Store ist, bevor die Session gestartet wird
    setTimeout(() => {
      useSessionControlStore.getState().requestStartFromOnboarding({
        participantId,
        topic: selectedTopic,
        mode: selectedMode,
      });
      onClose();
    }, 500); // 500ms Delay wie im SocraticConfigDialog
  }

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
