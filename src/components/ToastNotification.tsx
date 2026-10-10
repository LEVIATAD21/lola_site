import React from 'react';
import { CheckCircle2, Heart, Info, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastNotificationProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-[#2A211B] text-white p-3.5 rounded-xl shadow-xl border border-[#C49A5A]/30 flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200"
        >
          <div className="mt-0.5 shrink-0">
            {toast.type === 'favorite' ? (
              <Heart className="w-4 h-4 text-[#C49A5A] fill-[#C49A5A]" />
            ) : toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Info className="w-4 h-4 text-[#C49A5A]" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-semibold text-[#F8F4ED]">{toast.title}</h5>
            {toast.description && (
              <p className="text-[11px] text-[#DCC7B0] mt-0.5 leading-snug">{toast.description}</p>
            )}
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Dispensar aviso"
            className="text-[#DCC7B0] hover:text-white p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
