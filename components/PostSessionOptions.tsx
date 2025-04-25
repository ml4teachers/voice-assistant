import React from "react";
import { Button } from "@/components/ui/button";

interface PostSessionOptionsProps {
  onContinueTopic: () => void;
  onNewTopic: () => void;
  onEndExperiment: () => void;
}

const PostSessionOptions: React.FC<PostSessionOptionsProps> = ({
  onContinueTopic,
  onNewTopic,
  onEndExperiment,
}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-6 h-full">
      <div className="text-lg font-medium text-center mb-2">
        Sitzung beendet. Was möchten Sie als Nächstes tun?
      </div>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Button variant="outline" onClick={onContinueTopic}>
          Gleiches Thema fortsetzen
        </Button>
        <Button variant="outline" onClick={onNewTopic}>
          Neues Thema wählen
        </Button>
        <Button variant="default" onClick={onEndExperiment}>
          Experiment beenden &amp; Feedback geben
        </Button>
      </div>
    </div>
  );
};

export default PostSessionOptions;
