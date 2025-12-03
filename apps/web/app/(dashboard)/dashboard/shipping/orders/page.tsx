"use client";

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, X } from 'lucide-react';
import { shippingApi, type Order, type Page } from '../../../../../lib/shipping-api';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Page<Order> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shippingApi.orders.list({ limit: 50 });
      setOrders({
        ...data,
        results: data?.results || [],
        count: data?.count || 0,
        next: data?.next || null,
        previous: data?.previous || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
      setOrders(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const handleCreate = () => {
    setEditingOrder(null);
    setIsModalOpen(true);
  };

  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setIsModalOpen(true);
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
      await shippingApi.orders.cancel(id);
      void loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel order');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return;
    try {
      await shippingApi.orders.delete(id);
      void loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete order');
    }
  };

  const handleSubmit = async (formData: Order) => {
    try {
      setIsSubmitting(true);
      if (editingOrder?.id) {
        await shippingApi.orders.update(editingOrder.id, formData);
      } else {
        await shippingApi.orders.create(formData);
      }
      setIsModalOpen(false);
      setEditingOrder(null);
      void loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Orders</h1>
          <p className="text-sm text-slate-400 mt-1">Manage shipping orders</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          Create Order
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
      ) : orders && orders.results && orders.results.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Order ID</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Source</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Shipments</th>
                <th className="px-4 py-3 text-right text-slate-400 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(orders.results || []).map((order) => (
                <tr key={order.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200 font-mono text-xs">
                    {order.order_id || order.id?.slice(0, 8) || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                      order.status === 'fulfilled' ? 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/40' :
                      order.status === 'cancelled' ? 'bg-rose-500/10 text-rose-200 border border-rose-500/40' :
                      'bg-slate-500/10 text-slate-200 border border-slate-500/40'
                    }`}>
                      {order.status || 'pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{order.source || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {order.shipments?.length || 0} shipment(s)
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {order.status !== 'cancelled' && (
                        <button
                          onClick={() => order.id && handleCancel(order.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(order)}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => order.id && handleDelete(order.id)}
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
          <p className="text-slate-400">No orders found. Create your first order to get started.</p>
        </div>
      )}

      {isModalOpen && (
        <OrderModal
          order={editingOrder}
          onClose={() => {
            setIsModalOpen(false);
            setEditingOrder(null);
          }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}

function OrderModal({
  order,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  order: Order | null;
  onClose: () => void;
  onSubmit: (data: Order) => void;
  isSubmitting: boolean;
}) {
  const [formData, setFormData] = useState<Order>({
    order_id: order?.order_id || '',
    status: order?.status || 'pending',
    source: order?.source || '',
    line_items: order?.line_items || [],
    options: order?.options || {},
    metadata: order?.metadata || {},
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
            {order ? 'Edit Order' : 'Create Order'}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Order ID</label>
            <input
              type="text"
              value={formData.order_id}
              onChange={(e) => setFormData({ ...formData, order_id: e.target.value })}
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
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Source</label>
            <input
              type="text"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="e.g., web, api, manual"
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

