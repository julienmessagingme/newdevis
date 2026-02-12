import { Upload, BarChart3, Lock, Unlock } from "lucide-react";

interface FunnelStepperProps {
  currentStep: 1 | 2 | 3;
}

const steps = [
  { label: "Envoyez votre devis", icon: Upload },
  { label: "Analyse gratuite", icon: BarChart3 },
  { label: "Analyse complète", lockedIcon: Lock, unlockedIcon: Unlock },
];

const FunnelStepper = ({ currentStep }: FunnelStepperProps) => {
  return (
    <>
      {/* Desktop stepper */}
      <div className="hidden sm:flex items-center justify-center mb-8">
        {steps.map((step, index) => {
          const stepNumber = (index + 1) as 1 | 2 | 3;
          const status: "completed" | "active" | "pending" =
            stepNumber < currentStep ? "completed" :
            stepNumber === currentStep ? "active" : "pending";

          const Icon = step.lockedIcon
            ? (status === "completed" ? step.unlockedIcon! : step.lockedIcon)
            : step.icon!;

          return (
            <div key={index} className="flex items-center">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    status === "completed"
                      ? "bg-score-green text-white"
                      : status === "active"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted border-2 border-border text-muted-foreground"
                  }`}
                >
                  {status === "completed" ? (
                    <span className="text-sm font-bold">✓</span>
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap ${
                    status === "completed"
                      ? "text-score-green"
                      : status === "active"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={`w-16 md:w-24 h-0.5 mx-3 mt-[-1.25rem] ${
                    stepNumber < currentStep ? "bg-score-green" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile compact stepper */}
      <div className="sm:hidden flex items-center justify-center gap-2 mb-6">
        <div className="flex items-center gap-1.5">
          {steps.map((_, index) => {
            const stepNumber = (index + 1) as 1 | 2 | 3;
            return (
              <div
                key={index}
                className={`w-2.5 h-2.5 rounded-full ${
                  stepNumber < currentStep
                    ? "bg-score-green"
                    : stepNumber === currentStep
                    ? "bg-primary"
                    : "bg-border"
                }`}
              />
            );
          })}
        </div>
        <span className="text-sm text-muted-foreground font-medium">
          Étape {currentStep}/3
        </span>
      </div>
    </>
  );
};

export default FunnelStepper;
