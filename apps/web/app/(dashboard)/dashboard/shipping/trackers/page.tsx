"use client";

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { shippingApi, type Tracker, type Page } from '../../../../../lib/shipping-api';

export default function TrackersPage() {
  const [trackers, setTrackers] = useState<Page<Tracker> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTracker, setEditingTracker] = useState<Tracker | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadTrackers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shippingApi.trackers.list({ limit: 50 });
      setTrackers({
        ...data,
        results: data?.results || [],
        count: data?.count || 0,
        next: data?.next || null,
        previous: data?.previous || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trackers');
      setTrackers(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTrackers();
  }, []);

  const handleCreate = () => {
    setEditingTracker(null);
    setIsModalOpen(true);
  };

  const handleEdit = (tracker: Tracker) => {
    setEditingTracker(tracker);
    setIsModalOpen(true);
  };

  const handleDelete = async (idOrTrackingNumber: string) => {
    if (!confirm('Are you sure you want to delete this tracker?')) return;
    try {
      await shippingApi.trackers.delete(idOrTrackingNumber);
      void loadTrackers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete tracker');
    }
  };

  const handleSubmit = async (formData: Tracker) => {
    try {
      setIsSubmitting(true);
      if (editingTracker?.id) {
        await shippingApi.trackers.update(editingTracker.id, formData);
      } else {
        await shippingApi.trackers.create(formData);
      }
      setIsModalOpen(false);
      setEditingTracker(null);
      void loadTrackers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save tracker');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Trackers</h1>
          <p className="text-sm text-slate-400 mt-1">Manage shipment tracking</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          Create Tracker
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : trackers && trackers.results && trackers.results.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Tracking Number</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Carrier</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Delivered</th>
                <th className="px-4 py-3 text-right text-slate-400 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(trackers.results || []).map((tracker) => (
                <tr key={tracker.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200 font-mono text-xs">
                    {tracker.tracking_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {tracker.carrier_name || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                      tracker.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/40' :
                      tracker.status === 'in_transit' ? 'bg-blue-500/10 text-blue-200 border border-blue-500/40' :
                      'bg-slate-500/10 text-slate-200 border border-slate-500/40'
                    }`}>
                      {tracker.status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {tracker.delivered ? 'Yes' : 'No'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(tracker)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => (tracker.id || tracker.tracking_number) && handleDelete(tracker.id || tracker.tracking_number || '')}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <p className="text-slate-400">No trackers found. Create your first tracker to get started.</p>
        </div>
      )}

      {isModalOpen && (
        <TrackerModal
          tracker={editingTracker}
          onClose={() => {
            setIsModalOpen(false);
            setEditingTracker(null);
          }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}

function TrackerModal({
  tracker,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  tracker: Tracker | null;
  onClose: () => void;
  onSubmit: (data: Tracker) => void;
  isSubmitting: boolean;
}) {
  const [formData, setFormData] = useState<Tracker>({
    tracking_number: tracker?.tracking_number || '',
    carrier_name: tracker?.carrier_name || '',
    carrier_id: tracker?.carrier_id || '',
    status: tracker?.status || '',
    metadata: tracker?.metadata || {},
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-semibold text-white">
            {tracker ? 'Edit Tracker' : 'Create Tracker'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Tracking Number *</label>
            <input
              type="text"
              required
              value={formData.tracking_number}
              onChange={(e) => setFormData({ ...formData, tracking_number: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Carrier Name</label>
            <input
              type="text"
              value={formData.carrier_name}
              onChange={(e) => setFormData({ ...formData, carrier_name: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Carrier ID</label>
            <input
              type="text"
              value={formData.carrier_id}
              onChange={(e) => setFormData({ ...formData, carrier_id: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
            >
              <option value="">Select status</option>
              <option value="pending">Pending</option>
              <option value="in_transit">In Transit</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="exception">Exception</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

