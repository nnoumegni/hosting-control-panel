"use client";

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../../../../lib/api';

interface AddDnsRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  zoneId: string;
  zoneName: string;
}

export function AddDnsRecordModal({
  isOpen,
  onClose,
  onSuccess,
  zoneId,
  zoneName,
}: AddDnsRecordModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('A');
  const [ttl, setTtl] = useState('300');
  const [values, setValues] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddValue = () => {
    setValues([...values, '']);
  };

  const handleRemoveValue = (index: number) => {
    if (values.length > 1) {
      setValues(values.filter((_, i) => i !== index));
    }
  };

  const handleValueChange = (index: number, value: string) => {
    const newValues = [...values];
    newValues[index] = value;
    setValues(newValues);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError('Record name is required');
      return;
    }

    const filteredValues = values.filter(v => v.trim());
    if (filteredValues.length === 0) {
      setError('At least one value is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch(`domains/dns/zones/${encodeURIComponent(zoneId)}/records`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          type,
          ttl: parseInt(ttl, 10) || 300,
          values: filteredValues,
        }),
      });

      // Reset form
      setName('');
      setType('A');
      setTtl('300');
      setValues(['']);
      setError(null);
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create DNS record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setName('');
      setType('A');
      setTtl('300');
      setValues(['']);
      setError(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg border border-slate-800 w-full max-w-2xl shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Add DNS Record</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
              <p className="text-sm text-rose-200">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
              Record Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`subdomain.${zoneName}`}
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
            />
            <p className="text-xs text-slate-400 mt-1">
              Leave empty or use @ for the zone root ({zoneName})
            </p>
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-slate-300 mb-2">
              Record Type
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="A">A (IPv4 Address)</option>
              <option value="AAAA">AAAA (IPv6 Address)</option>
              <option value="CNAME">CNAME (Canonical Name)</option>
              <option value="MX">MX (Mail Exchange)</option>
              <option value="TXT">TXT (Text)</option>
              <option value="SRV">SRV (Service)</option>
              <option value="PTR">PTR (Pointer)</option>
            </select>
          </div>

          <div>
            <label htmlFor="ttl" className="block text-sm font-medium text-slate-300 mb-2">
              TTL (Time To Live)
            </label>
            <input
              id="ttl"
              type="number"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              min="60"
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
            />
            <p className="text-xs text-slate-400 mt-1">Time in seconds (default: 300)</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">
                Values
              </label>
              <button
                type="button"
                onClick={handleAddValue}
                disabled={isSubmitting}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                Add Value
              </button>
            </div>
            <div className="space-y-2">
              {values.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleValueChange(index, e.target.value)}
                    placeholder={type === 'A' ? '192.0.2.1' : type === 'AAAA' ? '2001:db8::1' : 'value'}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
                  />
                  {values.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveValue(index)}
                      disabled={isSubmitting}
                      className="p-2 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? 'Creating...' : 'Create Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

