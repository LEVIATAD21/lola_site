import React from 'react';
import { Check } from 'lucide-react';

interface CheckoutStepperProps {
  currentStep: number; // 1: Entrega, 2: Pagamento, 3: Confirmação, 4: Pedido realizado
  onStepClick?: (step: number) => void;
}

export const CheckoutStepper: React.FC<CheckoutStepperProps> = ({ currentStep, onStepClick }) => {
  const steps = [
    { number: 1, label: 'Dados de entrega' },
    { number: 2, label: 'Pagamento' },
    { number: 3, label: 'Confirmação' },
    { number: 4, label: 'Pedido realizado' },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto py-6 px-4">
      <div className="relative flex items-center justify-between">
        
        {/* Connecting Line */}
        <div className="absolute left-8 right-8 top-4 -translate-y-1/2 h-[2px] bg-[#E7DED3] z-0" />

        {steps.map((step) => {
          const isCompleted = currentStep > step.number;
          const isActive = currentStep === step.number;

          return (
            <div
              key={step.number}
              onClick={() => onStepClick && step.number <= currentStep && onStepClick(step.number)}
              className={`relative z-10 flex flex-col items-center group ${
                step.number <= currentStep ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              {/* Circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-[#2A211B] text-white ring-4 ring-[#C49A5A]/30 shadow-md scale-110'
                    : isCompleted
                    ? 'bg-[#C49A5A] text-white shadow-xs'
                    : 'bg-white text-[#766D64] border border-[#E7DED3]'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : step.number}
              </div>

              {/* Label */}
              <span
                className={`text-[11px] sm:text-xs mt-2 text-center transition-colors whitespace-nowrap ${
                  isActive
                    ? 'font-semibold text-[#241F1B]'
                    : isCompleted
                    ? 'font-medium text-[#2A211B]'
                    : 'text-[#766D64]'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}

      </div>
    </div>
  );
};
