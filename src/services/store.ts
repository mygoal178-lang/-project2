/**
 * OrderFlow store — dual-mode: localStorage demo + Supabase hydrateCloud.
 */
import { useState, useEffect } from 'react';
import type { UserProfile, BusinessWorkspace, WhiteLabelConfig, AppNotification, ECommerceIntegration } from '../types';

const STORAGE_KEY = 'orderflow_global_state_v3';

const defaultUser: UserProfile = {
  id: 'usr_owner',
  email: 'demo@local.dev',
  full_name: 'Demo Owner',
  role: 'owner',
  preferred_language: 'en',
  created_at: new Date().toISOString()
};

const defaultWorkspace: BusinessWorkspace = {
  id: 'biz_demo',
  name: 'Demo Store',
  slug: 'demo',
  category: 'Retail',
  country: 'United States',
  country_code: 'US',
  currency: 'USD',
  currency_code: 'USD',
  currency_symbol: '$',
  currency_decimals: 2,
  phone_country_code: '+1',
  phone: '',
  email: 'demo@local.dev',
  address_line1: '',
  city: '',
  state_province_region: '',
  postal_zip_code: '',
  timezone: 'UTC',
  language: 'en',
  date_format: 'YYYY-MM-DD',
  clock_format: '12h',
  measurement_system: 'metric',
  tax_config: {
    name: 'Sales Tax',
    rate_percentage: 0,
    calculation_type: 'exclusive',
    is_enabled: false
  },
  logo_url: '',
  created_at: new Date().toISOString(),
  subscription_plan: 'pro',
  subscription_status: 'active',
  monthly_order_limit: 10000
};

const defaultWhiteLabel: WhiteLabelConfig = {
  app_name: 'OrderFlow',
  logo_url: '',
  primary_color: '#4f46e5',
  secondary_color: '#0f172a',
  company_legal_name: 'OrderFlow Inc',
  support_email: 'support@orderflow.app',
  support_phone: '',
  default_currency: 'USD',
  default_currency_symbol: '$',
  default_language: 'en',
  invoice_footer_note: '',
  enable_courier_integrations: true,
  enable_multi_currency: true,
  enable_gdpr_tools: true
};

const DEFAULT_INTEGRATIONS: ECommerceIntegration[] = [
  { id: 'integ_shopify', business_id: 'biz_demo', channel: 'shopify', name: 'Shopify Storefront', is_connected: false, store_url: '', orders_synced_count: 0, auto_sync: false },
  { id: 'integ_woo', business_id: 'biz_demo', channel: 'woocommerce', name: 'WooCommerce Store', is_connected: false, store_url: '', orders_synced_count: 0, auto_sync: false },
  { id: 'integ_amazon', business_id: 'biz_demo', channel: 'amazon', name: 'Amazon Marketplace', is_connected: false, orders_synced_count: 0, auto_sync: false },
  { id: 'integ_ebay', business_id: 'biz_demo', channel: 'ebay', name: 'eBay Store', is_connected: false, orders_synced_count: 0, auto_sync: false },
  { id: 'integ_etsy', business_id: 'biz_demo', channel: 'etsy', name: 'Etsy Shop', is_connected: false, orders_synced_count: 0, auto_sync: false }
];

const DEFAULT_PRODUCTS = [
  {
    id: 'prod_demo_1',
    business_id: 'biz_demo',
    title: 'Classic Cotton T-Shirt',
    name: 'Classic Cotton T-Shirt',
    sku: 'TSHIRT-001',
    selling_price: 24.99,
    cost_price: 8.5,
    stock: 120,
    category: 'Apparel',
    variants: [{ name: 'M / Black' }, { name: 'L / Black' }, { name: 'M / White' }]
  },
  {
    id: 'prod_demo_2',
    business_id: 'biz_demo',
    title: 'Wireless Earbuds Pro',
    name: 'Wireless Earbuds Pro',
    sku: 'EARBUD-PRO',
    selling_price: 59.0,
    cost_price: 22.0,
    stock: 45,
    category: 'Electronics',
    variants: []
  },
  {
    id: 'prod_demo_3',
    business_id: 'biz_demo',
    title: 'Ceramic Coffee Mug',
    name: 'Ceramic Coffee Mug',
    sku: 'MUG-01',
    selling_price: 14.5,
    cost_price: 3.2,
    stock: 200,
    category: 'Home',
    variants: [{ name: 'White' }, { name: 'Black' }]
  }
];

interface AppState {
  currentUser: UserProfile;
  activeBusinessId: string;
  workspaces: BusinessWorkspace[];
  members: any[];
  products: any[];
  customers: any[];
  orders: any[];
  couriers: any[];
  shipments: any[];
  expenses: any[];
  stockMovements: any[];
  notifications: AppNotification[];
  integrations: ECommerceIntegration[];
  whiteLabel: WhiteLabelConfig;
}

const DEFAULT_STATE: AppState = {
  currentUser: defaultUser,
  activeBusinessId: 'biz_demo',
  workspaces: [defaultWorkspace],
  members: [],
  products: [...DEFAULT_PRODUCTS],
  customers: [],
  orders: [],
  couriers: [],
  shipments: [],
  expenses: [],
  stockMovements: [],
  notifications: [],
  integrations: DEFAULT_INTEGRATIONS,
  whiteLabel: defaultWhiteLabel
};

function ensureProducts(state: AppState): AppState {
  const bid = state.activeBusinessId || 'biz_demo';
  let products = state.products || [];
  if (!products.length) {
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(bid));
    if (!looksLikeUuid) {
      products = DEFAULT_PRODUCTS.map((p) => ({ ...p, business_id: bid }));
    }
  }
  return { ...state, products };
}

function ensureIntegrations(state: AppState): AppState {
  const bid = state.activeBusinessId || 'biz_demo';
  let integrations = state.integrations || [];
  if (!integrations.length) {
    integrations = DEFAULT_INTEGRATIONS.map((i) => ({ ...i, business_id: bid }));
  } else {
    const channels = new Set(integrations.map((i) => i.channel));
    for (const def of DEFAULT_INTEGRATIONS) {
      if (!channels.has(def.channel)) {
        integrations = [...integrations, { ...def, id: `${def.id}_${bid}`, business_id: bid }];
      }
    }
  }
  integrations = integrations.map((i) => ({ ...i, business_id: i.business_id || bid }));
  return { ...state, integrations };
}

function loadInitialState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged: AppState = {
        ...DEFAULT_STATE,
        ...parsed,
        workspaces: parsed.workspaces?.length ? parsed.workspaces : DEFAULT_STATE.workspaces,
        whiteLabel: { ...DEFAULT_STATE.whiteLabel, ...(parsed.whiteLabel || {}) },
        integrations: parsed.integrations?.length ? parsed.integrations : DEFAULT_STATE.integrations
      };
      return ensureProducts(ensureIntegrations(merged));
    }
  } catch {}
  return ensureProducts(ensureIntegrations(DEFAULT_STATE));
}

let currentState: AppState = loadInitialState();
const listeners = new Set<() => void>();

function saveState(state: AppState) {
  currentState = ensureProducts(ensureIntegrations(state));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
  } catch {}
  listeners.forEach((fn) => fn());
}

const ALLOWED_ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'processing', 'cancelled'],
  confirmed: ['processing', 'ready_to_ship', 'cancelled'],
  processing: ['ready_to_ship', 'shipped', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: []
};

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const OrderFlowStore = {
  getState: () => currentState,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setActiveWorkspace(id: string) {
    saveState({ ...currentState, activeBusinessId: id });
  },

  setCurrentUser(user: UserProfile) {
    saveState({ ...currentState, currentUser: user });
  },

  switchUserRole(role: any) {
    saveState({
      ...currentState,
      currentUser: { ...currentState.currentUser, role }
    });
  },

  hydrateCloud(payload: {
    workspaces?: any[];
    members?: any[];
    products?: any[];
    orders?: any[];
    customers?: any[];
    expenses?: any[];
    integrations?: any[];
    activeBusinessId?: string;
  }) {
    const bid = payload.activeBusinessId || currentState.activeBusinessId;
    const next: AppState = {
      ...currentState,
      activeBusinessId: bid,
      workspaces: payload.workspaces?.length ? payload.workspaces : currentState.workspaces,
      members: payload.members ?? currentState.members,
      products: payload.products ?? [],
      orders: payload.orders ?? [],
      customers: payload.customers ?? [],
      expenses: payload.expenses ?? [],
      integrations: payload.integrations?.length ? payload.integrations : currentState.integrations,
      stockMovements: []
    };
    currentState = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
    } catch {}
    listeners.forEach((fn) => fn());
  },

  createWorkspace(ws: any) {
    const id = uid('biz');
    const newWs = { ...ws, id, created_at: new Date().toISOString() };
    const channelCopies: ECommerceIntegration[] = DEFAULT_INTEGRATIONS.map((i) => ({
      ...i,
      id: `${i.id}_${id}`,
      business_id: id,
      is_connected: false,
      orders_synced_count: 0
    }));
    saveState({
      ...currentState,
      workspaces: [...currentState.workspaces, newWs],
      integrations: [...currentState.integrations, ...channelCopies],
      activeBusinessId: id
    });
    return newWs;
  },

  updateWorkspace(id: string, updates: any) {
    saveState({
      ...currentState,
      workspaces: currentState.workspaces.map((w) => (w.id === id ? { ...w, ...updates } : w))
    });
  },

  addProduct(p: any) {
    const np = { ...p, id: uid('prod'), business_id: currentState.activeBusinessId };
    saveState({ ...currentState, products: [np, ...currentState.products] });
    return np;
  },

  updateProduct(id: string, u: any) {
    saveState({
      ...currentState,
      products: currentState.products.map((p) => (p.id === id ? { ...p, ...u } : p))
    });
  },

  deleteProduct(id: string) {
    saveState({
      ...currentState,
      products: currentState.products.filter((p) => p.id !== id)
    });
  },

  adjustStock(productId: string, delta: number, reason = 'manual_adjustment', note?: string) {
    if (!productId) return { success: false, error: 'Product ID is required.' };
    const qty = Number(delta);
    if (!Number.isFinite(qty) || qty === 0) {
      return { success: false, error: 'Adjustment quantity must be a non-zero number.' };
    }
    const product = currentState.products.find((p: any) => p.id === productId);
    if (!product) return { success: false, error: 'Product not found.' };
    const currentStock = Number(product.stock) || 0;
    const nextStock = currentStock + qty;
    if (nextStock < 0) {
      return { success: false, error: `Insufficient stock. Available: ${currentStock}, requested change: ${qty}.` };
    }
    const bid = product.business_id || currentState.activeBusinessId;
    const now = new Date().toISOString();
    const movement = {
      id: uid('mov'),
      business_id: bid,
      product_id: productId,
      product_title: product.title || product.name,
      quantity_change: qty,
      stock_before: currentStock,
      stock_after: nextStock,
      reason,
      note: note || '',
      actor_name: currentState.currentUser?.full_name || 'System',
      created_at: now
    };
    saveState({
      ...currentState,
      products: currentState.products.map((p: any) =>
        p.id === productId ? { ...p, stock: nextStock, updated_at: now } : p
      ),
      stockMovements: [movement, ...currentState.stockMovements]
    });
    return { success: true, product: { ...product, stock: nextStock }, movement };
  },

  createOrder(orderData: any) {
    try {
      if (!orderData || !orderData.customerName) {
        return { success: false, error: 'Customer name is required.' };
      }
      const itemsIn = Array.isArray(orderData.items) ? orderData.items : [];
      if (!itemsIn.length) {
        return { success: false, error: 'At least one product item is required.' };
      }
      const bid = currentState.activeBusinessId;
      const id = uid('ord');
      const orderNumber = `OF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const ws = currentState.workspaces.find((w) => w.id === bid);
      const currency = orderData.currencyCode || ws?.currency || 'USD';
      const currencySymbol = orderData.currencySymbol || ws?.currency_symbol || '$';
      let subtotal = 0;
      const items = itemsIn.map((it: any, idx: number) => {
        const qty = Number(it.quantity) || 1;
        const catalog = currentState.products.find((p: any) => p.id === (it.productId || it.product_id));
        const unit = Number(it.unitPrice ?? it.unit_price ?? it.price) || Number(catalog?.selling_price) || 0;
        const unitCost = Number(it.unitCost ?? it.unit_cost) || Number(catalog?.cost_price ?? catalog?.purchase_price) || 0;
        const line = qty * unit;
        subtotal += line;
        return {
          id: `oi_${Date.now()}_${idx}`,
          order_id: id,
          product_id: it.productId || it.product_id || catalog?.id || '',
          product_title: it.productTitle || it.product_title || it.title || catalog?.title || catalog?.name || 'Item',
          variant_name: it.variantName || it.variant_name,
          sku: it.sku || catalog?.sku || '',
          quantity: qty,
          unit_price: unit,
          unit_cost: unitCost,
          total_price: line
        };
      });
      const discount = Number(orderData.discount) || 0;
      const delivery = Number(orderData.deliveryCharge ?? orderData.delivery_charge) || 0;
      const tax = Number(orderData.taxAmount ?? orderData.tax_amount) || 0;
      const total = Math.max(0, subtotal - discount + delivery + tax);
      const totalCost = items.reduce((s: number, it: any) => s + it.unit_cost * it.quantity, 0);
      const now = new Date().toISOString();
      const qtyByProduct = new Map<string, number>();
      for (const it of items) {
        if (!it.product_id) continue;
        const q = Number(it.quantity) || 0;
        if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q)) {
          return { success: false, error: 'Quantities must be positive integers.' };
        }
        qtyByProduct.set(it.product_id, (qtyByProduct.get(it.product_id) || 0) + q);
      }
      const stockChecks: Array<{ productId: string; qty: number; available: number; title: string }> = [];
      for (const [productId, qty] of qtyByProduct) {
        const catalog = currentState.products.find((p: any) => p.id === productId);
        if (!catalog) continue;
        const available = Number(catalog.stock) || 0;
        if (qty > available) {
          return {
            success: false,
            error: `Insufficient stock for "${catalog.title || catalog.name}". Available: ${available}, requested: ${qty}.`
          };
        }
        stockChecks.push({ productId, qty, available, title: catalog.title || catalog.name });
      }
      const order: any = {
        id,
        order_number: orderNumber,
        business_id: bid,
        customer_id: orderData.customerId,
        customer_name: orderData.customerName,
        customer_phone: orderData.customerPhone || '',
        customer_email: orderData.customerEmail,
        shipping_address: orderData.shippingAddress || orderData.address || { city: orderData.shippingCity || '' },
        shipping_city: orderData.shippingCity,
        shipping_country_code: orderData.shippingCountryCode,
        address: orderData.address || orderData.shippingAddress,
        status: 'pending',
        payment_status: orderData.paymentStatus || 'unpaid',
        payment_method: orderData.paymentMethod || 'cod',
        currency,
        currency_code: currency,
        currency_symbol: currencySymbol,
        subtotal,
        discount,
        delivery_charge: delivery,
        tax_amount: tax,
        total_amount: total,
        total_cost: totalCost,
        estimated_profit: total - totalCost,
        items,
        courier_name: orderData.courierProvider,
        package_weight_kg: orderData.packageWeightKg,
        internal_notes: orderData.internalNotes,
        stock_deducted: true,
        timeline: [{ id: uid('tl'), timestamp: now, status: 'pending', note: 'Order created', actor_name: currentState.currentUser?.full_name || 'System' }],
        created_at: now,
        updated_at: now
      };
      let customers = currentState.customers;
      if (!orderData.customerId && orderData.customerName) {
        const custId = uid('cust');
        customers = [{
          id: custId,
          business_id: bid,
          name: orderData.customerName,
          phone: orderData.customerPhone || '',
          email: orderData.customerEmail,
          city: orderData.shippingCity || '',
          category: 'new',
          total_orders: 1,
          total_spent: total,
          created_at: now
        }, ...customers];
        order.customer_id = custId;
      } else if (orderData.customerId) {
        customers = customers.map((c: any) =>
          c.id === orderData.customerId
            ? { ...c, total_orders: (Number(c.total_orders) || 0) + 1, total_spent: (Number(c.total_spent) || 0) + total, updated_at: now }
            : c
        );
      }
      let products = [...currentState.products];
      const newMovements: any[] = [];
      for (const check of stockChecks) {
        const idx = products.findIndex((p: any) => p.id === check.productId);
        if (idx === -1) continue;
        const before = Number(products[idx].stock) || 0;
        const after = before - check.qty;
        products[idx] = { ...products[idx], stock: after, updated_at: now };
        newMovements.push({
          id: uid('mov'),
          business_id: bid,
          product_id: check.productId,
          product_title: check.title,
          quantity_change: -check.qty,
          stock_before: before,
          stock_after: after,
          reason: 'order_sale',
          note: `Order ${orderNumber}`,
          order_id: id,
          actor_name: currentState.currentUser?.full_name || 'System',
          created_at: now
        });
      }
      saveState({
        ...currentState,
        orders: [order, ...currentState.orders],
        customers,
        products,
        stockMovements: [...newMovements, ...currentState.stockMovements]
      });
      return { success: true, order };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to create order' };
    }
  },

  updateOrderStatus(orderId: string, status: string, note?: string) {
    const order = currentState.orders.find((o: any) => o.id === orderId);
    if (!order) return { success: false, error: 'Order not found.' };
    const prevStatus = order.status;
    const allowed = ALLOWED_ORDER_TRANSITIONS[prevStatus] || [];
    if (prevStatus !== status && !allowed.includes(status)) {
      return { success: false, error: `Invalid status transition: ${prevStatus} → ${status}` };
    }
    const now = new Date().toISOString();
    let products = currentState.products;
    let stockMovements = currentState.stockMovements;
    if ((status === 'cancelled' || status === 'returned') && order.stock_deducted && !order.stock_restored) {
      const newMovements: any[] = [];
      products = products.map((p: any) => {
        const line = (order.items || []).find((it: any) => it.product_id === p.id);
        if (!line) return p;
        const qty = Number(line.quantity) || 0;
        const before = Number(p.stock) || 0;
        const after = before + qty;
        newMovements.push({
          id: uid('mov'),
          business_id: order.business_id,
          product_id: p.id,
          product_title: p.title || p.name,
          quantity_change: qty,
          stock_before: before,
          stock_after: after,
          reason: status === 'returned' ? 'return_restore' : 'cancellation_restore',
          note: `Order ${order.order_number}`,
          order_id: orderId,
          created_at: now
        });
        return { ...p, stock: after, updated_at: now };
      });
      stockMovements = [...newMovements, ...stockMovements];
      order.stock_restored = true;
    }
    const updated = {
      ...order,
      status,
      updated_at: now,
      timeline: [
        ...(order.timeline || []),
        { id: uid('tl'), timestamp: now, status, note: note || `Status → ${status}`, actor_name: currentState.currentUser?.full_name || 'System' }
      ]
    };
    saveState({
      ...currentState,
      orders: currentState.orders.map((o: any) => (o.id === orderId ? updated : o)),
      products,
      stockMovements
    });
    return { success: true, order: updated };
  },

  deleteOrder(id: string) {
    saveState({ ...currentState, orders: currentState.orders.filter((o: any) => o.id !== id) });
  },

  addCustomer(c: any) {
    const nc = { ...c, id: uid('cust'), business_id: currentState.activeBusinessId, created_at: new Date().toISOString() };
    saveState({ ...currentState, customers: [nc, ...currentState.customers] });
    return nc;
  },

  updateCustomer(id: string, u: any) {
    saveState({
      ...currentState,
      customers: currentState.customers.map((c: any) => (c.id === id ? { ...c, ...u } : c))
    });
  },

  deleteCustomer(id: string) {
    saveState({ ...currentState, customers: currentState.customers.filter((c: any) => c.id !== id) });
  },

  addExpense(e: any) {
    const ne = { ...e, id: uid('exp'), business_id: currentState.activeBusinessId, created_at: new Date().toISOString() };
    saveState({ ...currentState, expenses: [ne, ...currentState.expenses] });
    return ne;
  },

  updateExpense(id: string, u: any) {
    saveState({
      ...currentState,
      expenses: currentState.expenses.map((e: any) => (e.id === id ? { ...e, ...u } : e))
    });
  },

  deleteExpense(id: string) {
    saveState({ ...currentState, expenses: currentState.expenses.filter((e: any) => e.id !== id) });
  },

  updateCourierConfig(id: string, updates: any) {
    saveState({
      ...currentState,
      couriers: currentState.couriers.map((c: any) => (c.id === id ? { ...c, ...updates } : c))
    });
  },

  createShipment(payload: any) {
    const s = {
      id: uid('ship'),
      business_id: currentState.activeBusinessId,
      ...payload,
      status: 'booked',
      created_at: new Date().toISOString()
    };
    saveState({ ...currentState, shipments: [s, ...currentState.shipments] });
    return s;
  },

  updateShipmentStatus(id: string, status: string) {
    saveState({
      ...currentState,
      shipments: currentState.shipments.map((s: any) => (s.id === id ? { ...s, status } : s))
    });
  },

  toggleIntegrationConnection(id: string, isConnected: boolean) {
    saveState({
      ...currentState,
      integrations: currentState.integrations.map((i) =>
        i.id === id ? { ...i, is_connected: isConnected } : i
      )
    });
  },

  syncChannelOrders(id: string, count?: number) {
    const n = typeof count === 'number' ? count : 0;
    saveState({
      ...currentState,
      integrations: currentState.integrations.map((i) =>
        i.id === id
          ? { ...i, orders_synced_count: (i.orders_synced_count || 0) + n, last_sync_at: new Date().toISOString() }
          : i
      )
    });
    return n;
  },

  markNotificationAsRead(id: string) {
    saveState({
      ...currentState,
      notifications: currentState.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    });
  },

  markAllNotificationsAsRead() {
    saveState({
      ...currentState,
      notifications: currentState.notifications.map((n) => ({ ...n, is_read: true }))
    });
  },

  updateWhiteLabel(updates: Partial<WhiteLabelConfig>) {
    saveState({ ...currentState, whiteLabel: { ...currentState.whiteLabel, ...updates } });
  },

  resetToDemoData() {
    currentState = ensureProducts(ensureIntegrations({ ...DEFAULT_STATE }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
    } catch {}
    listeners.forEach((fn) => fn());
  }
};

export function useOrderFlowStore() {
  const [, setTick] = useState(0);
  useEffect(() => OrderFlowStore.subscribe(() => setTick((t) => t + 1)), []);
  const s = OrderFlowStore.getState();
  const bid = s.activeBusinessId;
  return {
    state: s,
    currentUser: s.currentUser,
    activeWorkspace: s.workspaces.find((w) => w.id === bid) || s.workspaces[0] || defaultWorkspace,
    workspaces: s.workspaces,
    members: s.members.filter((m: any) => !m.business_id || m.business_id === bid),
    products: s.products.filter((p: any) => !p.business_id || p.business_id === bid),
    orders: s.orders.filter((o: any) => !o.business_id || o.business_id === bid),
    customers: s.customers.filter((c: any) => !c.business_id || c.business_id === bid),
    couriers: s.couriers.filter((c: any) => !c.business_id || c.business_id === bid),
    shipments: s.shipments.filter((x: any) => !x.business_id || x.business_id === bid),
    expenses: s.expenses.filter((e: any) => !e.business_id || e.business_id === bid),
    notifications: s.notifications.filter((n: any) => !n.business_id || n.business_id === bid),
    stockMovements: s.stockMovements.filter((m: any) => !m.business_id || m.business_id === bid),
    whiteLabel: s.whiteLabel,
    integrations: s.integrations.filter((i) => !i.business_id || i.business_id === bid),
    actions: OrderFlowStore
  };
}
