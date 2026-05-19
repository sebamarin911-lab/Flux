import React, { useEffect } from 'react';
import { AlertTriangle, Sparkles, X } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: 'danger' | 'primary' | 'success';
  isAiSuggestion?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export function ConfirmationDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'primary',
  isAiSuggestion = false,
  onConfirm,
  onCancel,
  onClose
}: ConfirmationDialogProps) {
  
  // Close on Escape key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getButtonStyles = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'bg-red-500 hover:bg-red-600 focus:ring-red-500/50 text-white shadow-red-500/10';
      case 'success':
        return 'bg-green-500 hover:bg-green-600 focus:ring-green-500/50 text-white shadow-green-500/10';
      case 'primary':
      default:
        return 'bg-flux-500 hover:bg-flux-600 focus:ring-flux-500/50 text-white shadow-flux-500/10';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-surface-950/40 dark:bg-surface-950/70 backdrop-blur-sm transition-opacity"
      ></div>

      {/* Dialog Body */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white/90 dark:bg-surface-950/90 backdrop-blur-md border border-surface-100 dark:border-surface-800 shadow-xl transition-all p-6 text-left flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {isAiSuggestion ? (
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center text-purple-500 flex-shrink-0 animate-pulse">
                <Sparkles className="w-5 h-5" />
              </div>
            ) : confirmVariant === 'danger' ? (
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-500 flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-flux-50 dark:bg-flux-900/20 flex items-center justify-center text-flux-500 flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
            )}
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-50 font-display">
              {title}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="rounded-lg p-1.5 text-surface-400 hover:text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-900 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed font-sans">
          {message}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-900 border border-surface-200 dark:border-surface-800 transition-all cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-surface-950 cursor-pointer shadow-lg ${getButtonStyles()}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
