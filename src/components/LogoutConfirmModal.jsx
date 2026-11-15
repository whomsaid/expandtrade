import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';

export default function LogoutConfirmModal({ open, onConfirm, onCancel }) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onCancel?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
      aria-describedby="logout-confirm-message"
      onClick={() => {
        if (!submitting) onCancel?.();
      }}
    >
      <div
        className="animate-scale-in bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-[#0B192C] dark:text-slate-100">
            <LogOut className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h2 id="logout-confirm-title" className="text-base font-bold text-[#0B192C] dark:text-white">
              Confirm Logout
            </h2>
            <p id="logout-confirm-message" className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to log out of your account?
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              if (!submitting) onCancel?.();
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
          >
            {submitting ? 'Logging out...' : 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
}
