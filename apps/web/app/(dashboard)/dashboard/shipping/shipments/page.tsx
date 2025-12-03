"use client";

import { useState, useEffect } from 'react';
import { Plus, Edit2, Loader2, ShoppingCart, X, DollarSign } from 'lucide-react';
import { shippingApi, type Shipment, type Page, type Address } from '../../../../../lib/shipping-api';

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Page<Shipment> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShipment, setEditingShipment] = useState<Shipment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isRatesModalOpen, setIsRatesModalOpen] = useState(false);

  const loadShipments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shippingApi.shipments.list({ limit: 50 });
      // Ensure results array exists
      setShipments({
        ...data,
        results: data?.results || [],
        count: data?.count || 0,
        next: data?.next || null,
        previous: data?.previous || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shipments');
      setShipments(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadShipments();
  }, []);

  const handleCreate = () => {
    setEditingShipment(null);
    setIsModalOpen(true);
  };

  const handleEdit = (shipment: Shipment) => {
    setEditingShipment(shipment);
    setIsModalOpen(true);
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this shipment?')) return;
    try {
      await shippingApi.shipments.cancel(id);
      void loadShipments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel shipment');
    }
  };

  const handlePurchase = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setIsPurchaseModalOpen(true);
  };

  const handleRates = async (id: string) => {
    try {
      const shipment = await shippingApi.shipments.rates(id);
      setSelectedShipment(shipment);
      setIsRatesModalOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fetch rates');
    }
  };

  const handleSubmit = async (formData: Shipment) => {
    try {
      setIsSubmitting(true);
      if (editingShipment?.id) {
        await shippingApi.shipments.update(editingShipment.id, formData);
      } else {
        await shippingApi.shipments.create(formData);
      }
      setIsModalOpen(false);
      setEditingShipment(null);
      void loadShipments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save shipment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Shipments</h1>
          <p className="text-sm text-slate-400 mt-1">Manage shipping shipments</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          Create Shipment
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
      ) : shipments && shipments.results && shipments.results.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">ID</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Tracking</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Service</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Recipient</th>
                <th className="px-4 py-3 text-right text-slate-400 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(shipments.results || []).map((shipment) => (
                <tr key={shipment.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200 font-mono text-xs">{shipment.id?.slice(0, 8) || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                      shipment.status === 'purchased' ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/40' :
                      shipment.status === 'cancelled' ? 'bg-rose-500/10 text-rose-200 border border-rose-500/40' :
                      'bg-slate-500/10 text-slate-200 border border-slate-500/40'
                    }`}>
                      {shipment.status || 'draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                    {shipment.tracking_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{shipment.service || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {shipment.recipient?.person_name || shipment.recipient?.company_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {shipment.status !== 'purchased' && shipment.status !== 'cancelled' && (
                        <>
                          <button
                            onClick={() => shipment.id && handleRates(shipment.id)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition"
                            title="Get Rates"
                          >
                            <DollarSign className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => shipment.id && handlePurchase(shipment)}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition"
                            title="Purchase"
                          >
                            <ShoppingCart className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {shipment.status !== 'cancelled' && shipment.status !== 'purchased' && (
                        <button
                          onClick={() => shipment.id && handleCancel(shipment.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(shipment)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
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
          <p className="text-slate-400">No shipments found. Create your first shipment to get started.</p>
        </div>
      )}

      {isModalOpen && (
        <ShipmentModal
          shipment={editingShipment}
          onClose={() => {
            setIsModalOpen(false);
            setEditingShipment(null);
          }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}

      {isPurchaseModalOpen && selectedShipment && (
        <PurchaseModal
          shipment={selectedShipment}
          onClose={() => {
            setIsPurchaseModalOpen(false);
            setSelectedShipment(null);
          }}
          onSuccess={() => {
            setIsPurchaseModalOpen(false);
            setSelectedShipment(null);
            void loadShipments();
          }}
        />
      )}

      {isRatesModalOpen && selectedShipment && (
        <RatesModal
          shipment={selectedShipment}
          onClose={() => {
            setIsRatesModalOpen(false);
            setSelectedShipment(null);
          }}
        />
      )}
    </div>
  );
}

function ShipmentModal({
  shipment,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  shipment: Shipment | null;
  onClose: () => void;
  onSubmit: (data: Shipment) => void;
  isSubmitting: boolean;
}) {
  const [formData, setFormData] = useState<Shipment>({
    shipper: shipment?.shipper || {} as Address,
    recipient: shipment?.recipient || {} as Address,
    parcels: shipment?.parcels || [],
    service: shipment?.service || '',
    options: shipment?.options || {},
    metadata: shipment?.metadata || {},
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-semibold text-white">
            {shipment ? 'Edit Shipment' : 'Create Shipment'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Service</label>
            <input
              type="text"
              value={formData.service}
              onChange={(e) => setFormData({ ...formData, service: e.target.value })}
              placeholder="e.g., standard, express"
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
            />
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

function PurchaseModal({
  shipment,
  onClose,
  onSuccess,
}: {
  shipment: Shipment;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedRateId, setSelectedRateId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipment.id || !selectedRateId) return;
    try {
      setIsSubmitting(true);
      await shippingApi.shipments.purchase(shipment.id, { selected_rate_id: selectedRateId });
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to purchase shipment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-2xl">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-semibold text-white">Purchase Shipment</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {shipment.rates && shipment.rates.length > 0 ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">Select Rate</label>
              {shipment.rates.map((rate) => (
                <label
                  key={rate.id}
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer ${
                    selectedRateId === rate.id
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-700 bg-slate-800/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="rate"
                    value={rate.id}
                    checked={selectedRateId === rate.id}
                    onChange={(e) => setSelectedRateId(e.target.value)}
                    className="text-emerald-600"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-white">
                      {rate.carrier_name} - {rate.service}
                    </div>
                    <div className="text-sm text-slate-400">
                      {rate.currency} {rate.total_charge?.toFixed(2)}
                      {rate.transit_days && ` • ${rate.transit_days} days`}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-slate-400">No rates available. Please fetch rates first.</p>
          )}
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
              disabled={isSubmitting || !selectedRateId}
              className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Purchasing...
                </span>
              ) : (
                'Purchase'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RatesModal({
  shipment,
  onClose,
}: {
  shipment: Shipment;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-xl font-semibold text-white">Shipping Rates</h2>
        </div>
        <div className="p-6">
          {shipment.rates && shipment.rates.length > 0 ? (
            <div className="space-y-3">
              {shipment.rates.map((rate) => (
                <div
                  key={rate.id}
                  className="p-4 rounded-md border border-slate-700 bg-slate-800/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-white">
                      {rate.carrier_name} - {rate.service}
                    </div>
                    <div className="text-lg font-semibold text-emerald-400">
                      {rate.currency} {rate.total_charge?.toFixed(2)}
                    </div>
                  </div>
                  {rate.transit_days && (
                    <div className="text-sm text-slate-400">
                      Estimated transit: {rate.transit_days} days
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400">No rates available.</p>
          )}
          <div className="flex justify-end pt-4 border-t border-slate-800 mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-white rounded-md hover:bg-slate-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

