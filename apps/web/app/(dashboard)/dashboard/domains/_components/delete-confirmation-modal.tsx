"use client";

import { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  confirmText?: string;
  itemName?: string;
  requireTypeToConfirm?: boolean; // If true, user must type the item name or "DELETE" to confirm
  error?: string | null; // Optional error message to display
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Delete',
  itemName,
  requireTypeToConfirm = false,
  error = null,
}: DeleteConfirmationModalProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (requireTypeToConfirm) {
      const expectedText = itemName?.toLowerCase() || 'delete';
      if (confirmationText.toLowerCase() !== expectedText) {
        return;
      }
    }

    setIsDeleting(true);
    try {
      await onConfirm();
      // Reset form on success
      setConfirmationText('');
      // Only close if there's no error (error prop will be set by parent if deletion failed)
      // The parent will set the error state, and we check it here
      // But since state updates are async, we need to wait a bit or check the error prop
      // Actually, if onConfirm throws, we won't reach here, so we can safely close
      onClose();
    } catch (error) {
      // Error handling is done by the parent component
      // The parent will set the error prop, and we should NOT close the modal
      // Don't call onClose() here - let the error be displayed
      console.error('Delete failed', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmationText('');
      onClose();
    }
  };

  const isConfirmDisabled = requireTypeToConfirm
    ? confirmationText.toLowerCase() !== (itemName?.toLowerCase() || 'delete')
    : false;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-red-500/30 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-300">{message}</p>
            </div>
          )}

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-rose-300 mb-1">Error</p>
                  <p className="text-sm text-rose-200">{error}</p>
                </div>
              </div>
            </div>
          )}

          {requireTypeToConfirm && itemName && (
            <div>
              <label htmlFor="confirmation" className="block text-sm font-medium text-slate-300 mb-2">
                Type <strong className="text-red-400">{itemName}</strong> to confirm:
              </label>
              <input
                id="confirmation"
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                disabled={isDeleting}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={itemName}
                autoComplete="off"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isDeleting}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isDeleting || isConfirmDisabled}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

