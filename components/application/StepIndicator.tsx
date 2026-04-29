type StepIndicatorProps = {
  currentStep: number;
  totalSteps: number;
  title: string;
};

export function StepIndicator({ currentStep, totalSteps, title }: StepIndicatorProps) {
  return (
    <div className="space-y-3">
      <div className="step-indicator__header">
        <span className="step-indicator__title">{title}</span>
        <span className="step-indicator__count">
          مرحله {currentStep} از {totalSteps}
        </span>
      </div>
      <div className="progress-bar">
        <span style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
      </div>
    </div>
  );
}
