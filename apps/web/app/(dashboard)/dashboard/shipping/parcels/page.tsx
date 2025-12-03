"use client";

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import { shippingApi, type Parcel, type Page } from '../../../../../lib/shipping-api';

export default function ParcelsPage() {
  const [parcels, setParcels] = useState<Page<Parcel> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadParcels = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shippingApi.parcels.list({ limit: 50 });
      setParcels({
        ...data,
        results: data?.results || [],
        count: data?.count || 0,
        next: data?.next || null,
        previous: data?.previous || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load parcels');
      setParcels(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadParcels();
  }, []);

  const handleCreate = () => {
    setEditingParcel(null);
    setIsModalOpen(true);
  };

  const handleEdit = (parcel: Parcel) => {
    setEditingParcel(parcel);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this parcel?')) return;
    try {
      await shippingApi.parcels.delete(id);
      void loadParcels();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete parcel');
    }
  };

  const handleSubmit = async (formData: Parcel) => {
    try {
      setIsSubmitting(true);
      if (editingParcel?.id) {
        await shippingApi.parcels.update(editingParcel.id, formData);
      } else {
        await shippingApi.parcels.create(formData);
      }
      setIsModalOpen(false);
      setEditingParcel(null);
      void loadParcels();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save parcel');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Parcels</h1>
          <p className="text-sm text-slate-400 mt-1">Manage parcel definitions</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          Add Parcel
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
      ) : parcels && parcels.results && parcels.results.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Packaging Type</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Weight</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Dimensions</th>
                <th className="px-4 py-3 text-right text-slate-400 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(parcels.results || []).map((parcel) => (
                <tr key={parcel.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200">{parcel.packaging_type || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {parcel.weight} {parcel.weight_unit}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {parcel.length && parcel.width && parcel.height
                      ? `${parcel.length} × ${parcel.width} × ${parcel.height} ${parcel.dimension_unit || ''}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(parcel)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => parcel.id && handleDelete(parcel.id)}
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
          <p className="text-slate-400">No parcels found. Create your first parcel to get started.</p>
        </div>
      )}

      {isModalOpen && (
        <ParcelModal
          parcel={editingParcel}
          onClose={() => {
            setIsModalOpen(false);
            setEditingParcel(null);
          }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}

function ParcelModal({
  parcel,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  parcel: Parcel | null;
  onClose: () => void;
  onSubmit: (data: Parcel) => void;
  isSubmitting: boolean;
}) {
  const [formData, setFormData] = useState<Parcel>({
    weight: parcel?.weight || 0,
    weight_unit: parcel?.weight_unit || 'kg',
    packaging_type: parcel?.packaging_type || '',
    length: parcel?.length,
    width: parcel?.width,
    height: parcel?.height,
    dimension_unit: parcel?.dimension_unit || 'cm',
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
            {parcel ? 'Edit Parcel' : 'Create Parcel'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Packaging Type</label>
            <input
              type="text"
              value={formData.packaging_type}
              onChange={(e) => setFormData({ ...formData, packaging_type: e.target.value })}
              placeholder="e.g., box, envelope, pallet"
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Weight *</label>
              <input
                type="number"
                required
                step="0.01"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Weight Unit *</label>
              <select
                value={formData.weight_unit}
                onChange={(e) => setFormData({ ...formData, weight_unit: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
              >
                <option value="kg">kg</option>
                <option value="lb">lb</option>
                <option value="g">g</option>
                <option value="oz">oz</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Length</label>
              <input
                type="number"
                step="0.01"
                value={formData.length || ''}
                onChange={(e) => setFormData({ ...formData, length: parseFloat(e.target.value) || undefined })}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Width</label>
              <input
                type="number"
                step="0.01"
                value={formData.width || ''}
                onChange={(e) => setFormData({ ...formData, width: parseFloat(e.target.value) || undefined })}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Height</label>
              <input
                type="number"
                step="0.01"
                value={formData.height || ''}
                onChange={(e) => setFormData({ ...formData, height: parseFloat(e.target.value) || undefined })}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Dimension Unit</label>
            <select
              value={formData.dimension_unit}
              onChange={(e) => setFormData({ ...formData, dimension_unit: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
            >
              <option value="cm">cm</option>
              <option value="in">in</option>
              <option value="m">m</option>
              <option value="ft">ft</option>
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

