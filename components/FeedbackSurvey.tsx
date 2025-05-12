import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface FeedbackSurveyProps {
  onSubmit: (answers: Record<string, number | string>) => void;
}

const likertOptions = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

const questions = [
  {
    key: "q1",
    text: "Wie natürlich hat sich der Wechsel zwischen Ihnen und dem KI-Partner während des Gesprächs angefühlt?",
  },
  {
    key: "q2",
    text: "Inwieweit hat Sie der KI-Partner durch seine Fragen dabei unterstützt, das Prüfungsthema tiefer zu durchdenken?",
  },
  {
    key: "q3",
    text: "Wie gut hatte der KI-Partner Ihrer Meinung nach Ihre Sprache verstanden?",
  },
  {
    key: "q4",
    text: "Hatten Sie das Gefühl, dass der KI-Partner Sie durch das Thema geleitet hat, ohne Ihnen die Antworten direkt vorzugeben?",
  },
  {
    key: "q5",
    text: "Wie stark erinnerte Sie die Konversation an ein echtes Gespräch mit einem Menschen?",
  },
];

const FeedbackSurvey: React.FC<FeedbackSurveyProps> = ({ onSubmit }) => {
  const [answers, setAnswers] = useState<Record<string, number | null>>({
    q1: null,
    q2: null,
    q3: null,
    q4: null,
    q5: null,
  });
  const [openFeedback, setOpenFeedback] = useState("");
  const allAnswered = Object.values(answers).every((v) => v !== null);

  const handleLikertChange = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: Number(value) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAnswered) return;
    onSubmit({ ...answers, openFeedback });
  };

  return (
    <form
      className="flex flex-col items-center justify-center gap-6 h-full w-full max-w-lg mx-auto"
      onSubmit={handleSubmit}
    >
      <div className="text-lg font-medium text-center mb-2">
        Feedback zum Experiment
      </div>
      <div className="flex flex-col gap-5 w-full">
        {questions.map((q) => (
          <div key={q.key} className="flex flex-col gap-2">
            <Label>{q.text}</Label>
            <RadioGroup
              className="flex flex-row justify-between w-full mt-1"
              value={answers[q.key]?.toString() || ""}
              onValueChange={(val) => handleLikertChange(q.key, val)}
            >
              {likertOptions.map((opt) => (
                <RadioGroupItem
                  key={opt.value}
                  value={opt.value.toString()}
                  id={`${q.key}_${opt.value}`}
                />
              ))}
            </RadioGroup>
            <div className="flex flex-row justify-between w-full text-xs text-muted-foreground">
              <span>1 = gar nicht</span>
              <span>5 = sehr</span>
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <Label htmlFor="openFeedback">Offenes Feedback (optional):</Label>
          <Textarea
            id="openFeedback"
            value={openFeedback}
            onChange={(e) => setOpenFeedback(e.target.value)}
            placeholder="Ihre Anmerkungen..."
            rows={3}
          />
        </div>
      </div>
      <Button type="submit" disabled={!allAnswered}>
        Abschließen &amp; Download starten
      </Button>
    </form>
  );
};

export default FeedbackSurvey;
