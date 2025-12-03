// Shipping API client - base URL: http://localhost:3000/md-shipping

const SHIPPING_API_BASE_URL = 'http://localhost:3000/md-shipping';

const resolveShippingUrl = (path: string): string => {
  const base = SHIPPING_API_BASE_URL.replace(/\/+$/, '');
  const cleanPath = path.replace(/^\/+/, '');
  return `${base}/${cleanPath}`;
};

export async function shippingApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveShippingUrl(path);
  const requestInit: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  };

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { errors?: Array<{ message?: string; code?: string }>; message?: string } | null;
    const errorMessage = errorBody?.errors?.[0]?.message ?? errorBody?.message ?? `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

// Type definitions based on the API schema
export interface Address {
  id?: string;
  object_type?: string;
  company_name?: string;
  person_name?: string;
  email?: string;
  phone_number?: string;
  street_number?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  postal_code?: string;
  state_code?: string;
  country_code: string;
  residential?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Parcel {
  id?: string;
  object_type?: string;
  packaging_type?: string;
  weight: number;
  weight_unit: string;
  length?: number;
  width?: number;
  height?: number;
  dimension_unit?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Rate {
  id?: string;
  object_type?: string;
  carrier_name?: string;
  carrier_id?: string;
  service?: string;
  currency?: string;
  total_charge?: number;
  transit_days?: number | null;
  extra_charges?: Array<Record<string, unknown>>;
  test_mode?: boolean;
}

export interface Shipment {
  id?: string;
  object_type?: string;
  status?: string;
  shipper?: Address;
  recipient?: Address;
  parcels?: Parcel[];
  service?: string;
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tracking_number?: string;
  label_url?: string;
  rates?: Rate[];
  test_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id?: string;
  object_type?: string;
  order_id?: string;
  status?: string;
  source?: string;
  shipping_to?: Address;
  line_items?: Array<Record<string, unknown>>;
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  shipments?: Shipment[];
  test_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Tracker {
  id?: string;
  object_type?: string;
  tracking_number?: string;
  carrier_name?: string;
  carrier_id?: string;
  status?: string;
  delivered?: boolean;
  info?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
  messages?: Array<Record<string, unknown>>;
  test_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Pickup {
  id?: string;
  object_type?: string;
  carrier_name?: string;
  carrier_id?: string;
  confirmation_number?: string;
  pickup_date?: string;
  address?: Address;
  ready_time?: string;
  closing_time?: string;
  parcels?: Parcel[];
  tracking_numbers?: string[];
  status?: string;
  metadata?: Record<string, unknown>;
  test_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Manifest {
  id?: string;
  object_type?: string;
  carrier_name?: string;
  carrier_id?: string;
  address?: Address;
  shipment_ids?: string[];
  shipment_identifiers?: string[];
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  messages?: Array<Record<string, unknown>>;
  test_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentTemplate {
  id?: string;
  object_type?: string;
  name?: string;
  slug?: string;
  template?: string;
  related_object?: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
  options?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Webhook {
  id?: string;
  object_type?: string;
  url?: string;
  enabled_events?: string[];
  secret?: string;
  disabled?: boolean;
  test_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CarrierConnection {
  id?: string;
  object_type?: string;
  carrier_name?: string;
  carrier_id?: string;
  credentials?: Record<string, unknown>;
  active?: boolean;
  is_system?: boolean;
  test_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BatchOperation {
  id?: string;
  status?: string;
  resource_type?: string;
  resources?: Array<Record<string, unknown>>;
  test_mode?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// API functions
export const shippingApi = {
  // Addresses
  addresses: {
    list: (params?: { limit?: number; offset?: number }) =>
      shippingApiFetch<Page<Address>>(`v1/addresses${params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''}`),
    get: (id: string) => shippingApiFetch<Address>(`v1/addresses/${id}`),
    create: (data: Address) => shippingApiFetch<Address>('v1/addresses', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Address>) => shippingApiFetch<Address>(`v1/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => shippingApiFetch<Address>(`v1/addresses/${id}`, { method: 'DELETE' }),
  },

  // Parcels
  parcels: {
    list: (params?: { limit?: number; offset?: number }) =>
      shippingApiFetch<Page<Parcel>>(`v1/parcels${params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''}`),
    get: (id: string) => shippingApiFetch<Parcel>(`v1/parcels/${id}`),
    create: (data: Parcel) => shippingApiFetch<Parcel>('v1/parcels', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Parcel>) => shippingApiFetch<Parcel>(`v1/parcels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => shippingApiFetch<Parcel>(`v1/parcels/${id}`, { method: 'DELETE' }),
  },

  // Shipments
  shipments: {
    list: (params?: { limit?: number; offset?: number; status?: string; carrier_name?: string; tracking_number?: string }) =>
      shippingApiFetch<Page<Shipment>>(`v1/shipments${params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''}`),
    get: (id: string) => shippingApiFetch<Shipment>(`v1/shipments/${id}`),
    create: (data: Shipment) => shippingApiFetch<Shipment>('v1/shipments', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Shipment>) => shippingApiFetch<Shipment>(`v1/shipments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    cancel: (id: string) => shippingApiFetch<Shipment>(`v1/shipments/${id}/cancel`, { method: 'POST' }),
    purchase: (id: string, data: { selected_rate_id: string; label_type?: string; payment?: Record<string, unknown>; reference?: string; metadata?: Record<string, unknown> }) =>
      shippingApiFetch<Shipment>(`v1/shipments/${id}/purchase`, { method: 'POST', body: JSON.stringify(data) }),
    rates: (id: string) => shippingApiFetch<Shipment>(`v1/shipments/${id}/rates`, { method: 'POST' }),
  },

  // Orders
  orders: {
    list: (params?: { limit?: number; offset?: number }) =>
      shippingApiFetch<Page<Order>>(`v1/orders${params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''}`),
    get: (id: string) => shippingApiFetch<Order>(`v1/orders/${id}`),
    create: (data: Order) => shippingApiFetch<Order>('v1/orders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Order>) => shippingApiFetch<Order>(`v1/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    cancel: (id: string) => shippingApiFetch<Order>(`v1/orders/${id}/cancel`, { method: 'POST' }),
    delete: (id: string) => shippingApiFetch<Order>(`v1/orders/${id}`, { method: 'DELETE' }),
  },

  // Trackers
  trackers: {
    list: (params?: { limit?: number; offset?: number; carrier_name?: string; status?: string }) =>
      shippingApiFetch<Page<Tracker>>(`v1/trackers${params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''}`),
    get: (idOrTrackingNumber: string) => shippingApiFetch<Tracker>(`v1/trackers/${idOrTrackingNumber}`),
    create: (data: Tracker) => shippingApiFetch<Tracker>('v1/trackers', { method: 'POST', body: JSON.stringify(data) }),
    update: (idOrTrackingNumber: string, data: Partial<Tracker>) => shippingApiFetch<Tracker>(`v1/trackers/${idOrTrackingNumber}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (idOrTrackingNumber: string) => shippingApiFetch<Tracker>(`v1/trackers/${idOrTrackingNumber}`, { method: 'DELETE' }),
  },
};

