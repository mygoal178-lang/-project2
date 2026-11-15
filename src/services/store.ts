/**
 * OrderFlow store — integrations, products seed, working orders.
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
    products = DEFAULT_PRODUCTS.map((p) => ({ ...p, business_id: bid }));
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

  createWorkspace(ws: any) {
    const id = `biz_${Date.now()}`;
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
    const np = { ...p, id: `prod_${Date.now()}`, business_id: currentState.activeBusinessId };
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
      return {
        success: false,
        error: `Insufficient stock. Available: ${currentStock}, requested change: ${qty}.`
      };
    }

    const bid = product.business_id || currentState.activeBusinessId;
    const now = new Date().toISOString();
    const movement = {
      id: `mov_${Date.now()}`,
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
      const id = `ord_${Date.now()}`;
      const orderNumber = `OF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const ws = currentState.workspaces.find((w) => w.id === bid);
      const currency = orderData.currencyCode || ws?.currency || 'USD';
      const currencySymbol = orderData.currencySymbol || ws?.currency_symbol || '$';

      let subtotal = 0;
      const items = itemsIn.map((it: any, idx: number) => {
        const qty = Number(it.quantity) || 1;
        const catalog = currentState.products.find(
          (p: any) => p.id === (it.productId || it.product_id)
        );
        const unit =
          Number(it.unitPrice ?? it.unit_price ?? it.price) ||
          Number(catalog?.selling_price) ||
          0;
        const unitCost =
          Number(it.unitCost ?? it.unit_cost) ||
          Number(catalog?.cost_price ?? catalog?.purchase_price) ||
          0;
        const line = qty * unit;
        subtotal += line;
        return {
          id: `oi_${Date.now()}_${idx}`,
          order_id: id,
          product_id: it.productId || it.product_id || catalog?.id || '',
          product_title:
            it.productTitle ||
            it.product_title ||
            it.title ||
            catalog?.title ||
            catalog?.name ||
            'Item',
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

      // Pre-validate stock — aggregate duplicate product lines first
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
        stockChecks.push({
          productId,
          qty,
          available,
          title: catalog.title || catalog.name
        });
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
        timeline: [
          {
            id: `tl_${Date.now()}`,
            timestamp: now,
            status: 'pending',
            note: 'Order created',
            actor_name: currentState.currentUser?.full_name || 'System'
          }
        ],
        created_at: now,
        updated_at: now
      };

      let customers = currentState.customers;
      if (!orderData.customerId && orderData.customerName) {
        const custId = `cust_${Date.now()}`;
        customers = [
          {
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
          },
          ...customers
        ];
        order.customer_id = custId;
      } else if (orderData.customerId) {
        customers = customers.map((c: any) =>
          c.id === orderData.customerId
            ? {
                ...c,
                total_orders: (Number(c.total_orders) || 0) + 1,
                total_spent: (Number(c.total_spent) || 0) + total,
                updated_at: now
              }
            : c
        );
      }

      // Atomically deduct stock and record movements
      let products = [...currentState.products];
      const newMovements: any[] = [];
      for (const check of stockChecks) {
        const idx = products.findIndex((p: any) => p.id === check.productId);
        if (idx === -1) continue;
        const before = Number(products[idx].stock) || 0;
        const after = before - check.qty;
        products[idx] = { ...products[idx], stock: after, updated_at: now };
        newMovements.push({
          id: `mov_${Date.now()}_${check.productId}`,
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
      return {
        success: false,
        error: `Invalid status transition: ${prevStatus} → ${status}`
      };
    }

    const now = new Date().toISOString();
    let products = currentState.products;
    let stockMovements = currentState.stockMovements;
    let stockRestored = order.stock_restored || false;

    // Restore stock exactly once when cancelling or returning a previously deducted order
    const shouldRestore =
      (status === 'cancelled' || status === 'returned') &&
      order.stock_deducted &&
      !stockRestored &&
      Array.isArray(order.items);

    if (shouldRestore) {
      products = products.map((p: any) => {
        const line = order.items.find((it: any) => it.product_id === p.id);
        if (!line) return p;
        const qty = Number(line.quantity) || 0;
        const before = Number(p.stock) || 0;
        const after = before + qty;
        stockMovements = [
          {
            id: `mov_restore_${Date.now()}_${p.id}`,
            business_id: order.business_id,
            product_id: p.id,
            product_title: p.title || p.name,
            quantity_change: qty,
            stock_before: before,
            stock_after: after,
            reason: status === 'returned' ? 'order_return' : 'order_cancel',
            note: `Restored from order ${order.order_number}`,
            order_id: orderId,
            actor_name: currentState.currentUser?.full_name || 'System',
            created_at: now
          },
          ...stockMovements
        ];
        return { ...p, stock: after, updated_at: now };
      });
      stockRestored = true;
    }

    saveState({
      ...currentState,
      products,
      stockMovements,
      orders: currentState.orders.map((o: any) =>
        o.id === orderId
          ? {
              ...o,
              status,
              stock_restored: stockRestored,
              updated_at: now,
              timeline: [
                ...(o.timeline || []),
                {
                  id: `tl_${Date.now()}`,
                  timestamp: now,
                  status,
                  note: note || `Status → ${status}`,
                  actor_name: currentState.currentUser?.full_name || 'System'
                }
              ]
            }
          : o
      )
    });

    return { success: true, previousStatus: prevStatus, status, stockRestored };
  },

  deleteOrder(orderId: string) {
    const order = currentState.orders.find((o: any) => o.id === orderId);
    if (!order) return { success: false, error: 'Order not found.' };

    // Restore stock if it was deducted and not yet restored
    let products = currentState.products;
    let stockMovements = currentState.stockMovements;
    if (order.stock_deducted && !order.stock_restored && Array.isArray(order.items)) {
      const now = new Date().toISOString();
      products = products.map((p: any) => {
        const line = order.items.find((it: any) => it.product_id === p.id);
        if (!line) return p;
        const qty = Number(line.quantity) || 0;
        const before = Number(p.stock) || 0;
        const after = before + qty;
        stockMovements = [
          {
            id: `mov_del_${Date.now()}_${p.id}`,
            business_id: order.business_id,
            product_id: p.id,
            product_title: p.title || p.name,
            quantity_change: qty,
            stock_before: before,
            stock_after: after,
            reason: 'order_delete_restore',
            note: `Restored on delete of ${order.order_number}`,
            order_id: orderId,
            actor_name: currentState.currentUser?.full_name || 'System',
            created_at: now
          },
          ...stockMovements
        ];
        return { ...p, stock: after, updated_at: now };
      });
    }

    saveState({
      ...currentState,
      products,
      stockMovements,
      orders: currentState.orders.filter((o: any) => o.id !== orderId)
    });
    return { success: true };
  },

  addCustomer(c: any) {
    if (!c?.name || !String(c.name).trim()) {
      return { success: false, error: 'Customer name is required.' };
    }
    const nc = {
      ...c,
      id: `cust_${Date.now()}`,
      business_id: currentState.activeBusinessId,
      name: String(c.name).trim(),
      total_orders: Number(c.total_orders) || 0,
      total_spent: Number(c.total_spent) || 0,
      category: c.category || 'new',
      created_at: new Date().toISOString()
    };
    saveState({ ...currentState, customers: [nc, ...currentState.customers] });
    return { success: true, customer: nc };
  },

  updateCustomer(customerId: string, updates: any) {
    if (!customerId) return { success: false, error: 'Customer ID is required.' };
    const existing = currentState.customers.find((c: any) => c.id === customerId);
    if (!existing) return { success: false, error: 'Customer not found.' };

    const safe = { ...updates };
    delete safe.id;
    delete safe.business_id;
    if (safe.name !== undefined && !String(safe.name).trim()) {
      return { success: false, error: 'Customer name cannot be empty.' };
    }

    const updated = {
      ...existing,
      ...safe,
      updated_at: new Date().toISOString()
    };

    saveState({
      ...currentState,
      customers: currentState.customers.map((c: any) => (c.id === customerId ? updated : c))
    });
    return { success: true, customer: updated };
  },

  deleteCustomer(customerId: string) {
    if (!customerId) return { success: false, error: 'Customer ID is required.' };
    const existing = currentState.customers.find((c: any) => c.id === customerId);
    if (!existing) return { success: false, error: 'Customer not found.' };

    // Soft-block if customer has orders
    const hasOrders = currentState.orders.some((o: any) => o.customer_id === customerId);
    if (hasOrders) {
      return {
        success: false,
        error: 'Cannot delete customer with existing orders. Archive or reassign orders first.'
      };
    }

    saveState({
      ...currentState,
      customers: currentState.customers.filter((c: any) => c.id !== customerId)
    });
    return { success: true };
  },

  updateCourierConfig(courierId: string, config: any) {
    if (!courierId) return { success: false, error: 'Courier ID is required.' };
    const existing = currentState.couriers.find((c: any) => c.id === courierId);

    if (existing) {
      const updated = {
        ...existing,
        ...config,
        id: existing.id,
        business_id: existing.business_id,
        updated_at: new Date().toISOString()
      };
      // Never store raw secrets in a way that pretends they are verified
      if (config.api_key || config.api_secret || config.client_secret) {
        updated.credentials_configured = true;
        updated.is_verified = false; // require explicit test
      }
      saveState({
        ...currentState,
        couriers: currentState.couriers.map((c: any) => (c.id === courierId ? updated : c))
      });
      return { success: true, courier: updated };
    }

    // Create new courier config
    const nc = {
      id: courierId.startsWith('courier_') ? courierId : `courier_${Date.now()}`,
      business_id: currentState.activeBusinessId,
      provider: config.provider || courierId,
      name: config.name || config.provider || 'Courier',
      is_connected: false,
      is_verified: false,
      credentials_configured: Boolean(config.api_key || config.api_secret),
      ...config,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    // Strip highly sensitive fields from persisted client state if present
    delete (nc as any).api_secret;
    delete (nc as any).client_secret;

    saveState({
      ...currentState,
      couriers: [nc, ...currentState.couriers]
    });
    return { success: true, courier: nc };
  },

  createShipment(payload: any) {
    if (!payload?.order_id) return { success: false, error: 'Order ID is required.' };
    const order = currentState.orders.find((o: any) => o.id === payload.order_id);
    if (!order) return { success: false, error: 'Order not found.' };

    const now = new Date().toISOString();
    const shipment = {
      id: `ship_${Date.now()}`,
      business_id: order.business_id || currentState.activeBusinessId,
      order_id: order.id,
      order_number: order.order_number,
      courier_id: payload.courier_id || null,
      courier_name: payload.courier_name || order.courier_name || 'Manual',
      tracking_number: payload.tracking_number || `MANUAL-${Date.now()}`,
      status: payload.status || 'created',
      shipping_address: order.shipping_address || order.address,
      package_weight_kg: payload.package_weight_kg || order.package_weight_kg,
      notes: payload.notes || '',
      is_manual: !payload.courier_id || payload.is_manual !== false,
      history: [
        {
          status: payload.status || 'created',
          timestamp: now,
          note: payload.notes || 'Shipment created'
        }
      ],
      created_at: now,
      updated_at: now
    };

    // Update order status to shipped if not already further along
    const orderStatus = order.status;
    const advanceToShipped = !['shipped', 'delivered', 'cancelled', 'returned'].includes(orderStatus);

    saveState({
      ...currentState,
      shipments: [shipment, ...currentState.shipments],
      orders: currentState.orders.map((o: any) =>
        o.id === order.id
          ? {
              ...o,
              status: advanceToShipped ? 'shipped' : o.status,
              tracking_number: shipment.tracking_number,
              courier_name: shipment.courier_name,
              updated_at: now,
              timeline: advanceToShipped
                ? [
                    ...(o.timeline || []),
                    {
                      id: `tl_${Date.now()}`,
                      timestamp: now,
                      status: 'shipped',
                      note: `Shipment created: ${shipment.tracking_number}`,
                      actor_name: currentState.currentUser?.full_name || 'System'
                    }
                  ]
                : o.timeline
            }
          : o
      )
    });

    return { success: true, shipment };
  },

  updateShipmentStatus(shipmentId: string, status: string, note?: string) {
    if (!shipmentId) return { success: false, error: 'Shipment ID is required.' };
    const shipment = currentState.shipments.find((s: any) => s.id === shipmentId);
    if (!shipment) return { success: false, error: 'Shipment not found.' };

    const now = new Date().toISOString();
    const historyEntry = {
      status,
      timestamp: now,
      note: note || `Status → ${status}`
    };

    saveState({
      ...currentState,
      shipments: currentState.shipments.map((s: any) =>
        s.id === shipmentId
          ? {
              ...s,
              status,
              updated_at: now,
              history: [...(s.history || []), historyEntry]
            }
          : s
      )
    });

    // Optionally sync order status
    if (shipment.order_id && (status === 'delivered' || status === 'failed' || status === 'returned')) {
      const orderStatusMap: Record<string, string> = {
        delivered: 'delivered',
        failed: 'processing',
        returned: 'returned'
      };
      const mapped = orderStatusMap[status];
      if (mapped) {
        this.updateOrderStatus(shipment.order_id, mapped, `Courier update: ${status}`);
      }
    }

    return { success: true };
  },

  addExpense(expense: any) {
    if (!expense?.title && !expense?.description) {
      return { success: false, error: 'Expense title or description is required.' };
    }
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return { success: false, error: 'Expense amount must be a non-negative number.' };
    }

    const ne = {
      id: `exp_${Date.now()}`,
      business_id: currentState.activeBusinessId,
      title: expense.title || expense.description || 'Expense',
      description: expense.description || '',
      amount,
      category: expense.category || 'general',
      date: expense.date || new Date().toISOString().slice(0, 10),
      payment_method: expense.payment_method || 'cash',
      vendor: expense.vendor || '',
      notes: expense.notes || '',
      created_by: currentState.currentUser?.id,
      created_at: new Date().toISOString()
    };

    saveState({
      ...currentState,
      expenses: [ne, ...currentState.expenses]
    });
    return { success: true, expense: ne };
  },

  updateExpense(expenseId: string, updates: any) {
    if (!expenseId) return { success: false, error: 'Expense ID is required.' };
    const existing = currentState.expenses.find((e: any) => e.id === expenseId);
    if (!existing) return { success: false, error: 'Expense not found.' };

    if (updates.amount !== undefined) {
      const amount = Number(updates.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return { success: false, error: 'Expense amount must be a non-negative number.' };
      }
    }

    const updated = {
      ...existing,
      ...updates,
      id: existing.id,
      business_id: existing.business_id,
      updated_at: new Date().toISOString()
    };

    saveState({
      ...currentState,
      expenses: currentState.expenses.map((e: any) => (e.id === expenseId ? updated : e))
    });
    return { success: true, expense: updated };
  },

  deleteExpense(expenseId: string) {
    if (!expenseId) return { success: false, error: 'Expense ID is required.' };
    const existing = currentState.expenses.find((e: any) => e.id === expenseId);
    if (!existing) return { success: false, error: 'Expense not found.' };

    saveState({
      ...currentState,
      expenses: currentState.expenses.filter((e: any) => e.id !== expenseId)
    });
    return { success: true };
  },

  toggleIntegrationConnection(id: string, isConnected: boolean) {
    saveState({
      ...currentState,
      integrations: currentState.integrations.map((i) =>
        i.id === id
          ? { ...i, is_connected: isConnected, last_sync_at: isConnected ? new Date().toISOString() : i.last_sync_at }
          : i
      )
    });
  },

  syncChannelOrders(id: string, importedCount = 1) {
    const n = typeof importedCount === 'number' ? importedCount : 1;
    saveState({
      ...currentState,
      integrations: currentState.integrations.map((i) =>
        i.id === id
          ? {
              ...i,
              last_sync_at: new Date().toISOString(),
              orders_synced_count: (i.orders_synced_count || 0) + n
            }
          : i
      )
    });
    return n;
  },

  updateWhiteLabel(u: any) {
    saveState({
      ...currentState,
      whiteLabel: { ...currentState.whiteLabel, ...u }
    });
  },

  markNotificationAsRead(notificationId: string) {
    if (!notificationId) return { success: false, error: 'Notification ID is required.' };
    const existing = currentState.notifications.find((n: any) => n.id === notificationId);
    if (!existing) return { success: false, error: 'Notification not found.' };

    saveState({
      ...currentState,
      notifications: currentState.notifications.map((n: any) =>
        n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    });
    return { success: true };
  },

  markAllNotificationsAsRead() {
    const bid = currentState.activeBusinessId;
    const now = new Date().toISOString();
    saveState({
      ...currentState,
      notifications: currentState.notifications.map((n: any) =>
        n.business_id === bid && !n.is_read
          ? { ...n, is_read: true, read_at: now }
          : n
      )
    });
    return { success: true };
  },

  addNotification(notification: any) {
    const n = {
      id: `notif_${Date.now()}`,
      business_id: currentState.activeBusinessId,
      title: notification.title || 'Notification',
      message: notification.message || '',
      type: notification.type || 'info',
      is_read: false,
      link: notification.link,
      created_at: new Date().toISOString()
    };
    saveState({
      ...currentState,
      notifications: [n, ...currentState.notifications]
    });
    return { success: true, notification: n };
  },

  resetToDemoData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    saveState({
      ...DEFAULT_STATE,
      products: [...DEFAULT_PRODUCTS],
      integrations: [...DEFAULT_INTEGRATIONS]
    });
  }
};

export function useOrderFlowStore() {
  const [state, setState] = useState(currentState);

  useEffect(() => {
    if (!currentState.integrations?.length || !currentState.products?.length) {
      saveState(ensureProducts(ensureIntegrations(currentState)));
    }
    return OrderFlowStore.subscribe(() => setState(OrderFlowStore.getState()));
  }, []);

  const activeWorkspace =
    state.workspaces.find((w) => w.id === state.activeBusinessId) || state.workspaces[0];
  const bid = state.activeBusinessId;

  let integrations = state.integrations.filter((i: any) => i.business_id === bid);
  if (!integrations.length) {
    integrations = state.integrations.length
      ? state.integrations
      : DEFAULT_INTEGRATIONS.map((i) => ({ ...i, business_id: bid }));
  }

  return {
    state,
    currentUser: state.currentUser,
    activeWorkspace,
    workspaces: state.workspaces,
    members: state.members.filter((m: any) => m.business_id === bid),
    products: (() => {
      const filtered = state.products.filter((p: any) => p.business_id === bid);
      return filtered.length ? filtered : state.products;
    })(),
    orders: state.orders.filter((o: any) => o.business_id === bid),
    customers: state.customers.filter((c: any) => c.business_id === bid),
    couriers: state.couriers.filter((c: any) => c.business_id === bid),
    shipments: state.shipments.filter((s: any) => s.business_id === bid),
    expenses: state.expenses.filter((e: any) => e.business_id === bid),
    notifications: state.notifications.filter((n: any) => n.business_id === bid),
    integrations,
    stockMovements: state.stockMovements.filter((m: any) => m.business_id === bid),
    whiteLabel: state.whiteLabel,
    actions: OrderFlowStore
  };
}
