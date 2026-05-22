import { useState, useCallback } from 'react';
import { Joyride, type EventData, STATUS, EVENTS, type Step } from 'react-joyride';
import { tourStyles } from '@/lib/tourStyles';
import { markTourCompleted, markTourSkipped } from '@/lib/tours';

interface TourGuideProps {
  tourId: string;
  steps: Step[];
  run: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
}

export default function TourGuide({ tourId, steps, run, onComplete, onSkip }: TourGuideProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const handleEvent = useCallback((data: EventData) => {
    const { status, index, action, type } = data;

    if (type === EVENTS.STEP_AFTER) {
      setStepIndex(index + (action === 'prev' ? -1 : 1));
    }

    if (status === STATUS.FINISHED) {
      markTourCompleted(tourId);
      onComplete?.();
      setStepIndex(0);
    }

    if (status === STATUS.SKIPPED) {
      markTourSkipped(tourId);
      onSkip?.();
      setStepIndex(0);
    }
  }, [tourId, onComplete, onSkip]);

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      styles={tourStyles}
      onEvent={handleEvent}
      options={{
        showProgress: true,
        overlayClickAction: false,
        spotlightPadding: 8,
        blockTargetInteraction: false,
        buttons: ['back', 'close', 'primary', 'skip'],
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done!',
        next: 'Next',
        skip: 'Skip Tour',
        open: 'Open',
      }}
    />
  );
}
