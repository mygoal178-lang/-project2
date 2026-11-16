/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useOrderFlowStore } from './services/store';
import { LandingPage } from './components/landing/LandingPage';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardView } from './components/dashboard/DashboardView';
import { OrdersView } from './components/orders/OrdersView';
import { NewOrderModal } from './components/orders/NewOrderModal';
import { InvoiceModal } from './components/invoices/InvoiceModal';
import { InventoryView } from './components/inventory/InventoryView';
import { CustomersView } from './components/customers/CustomersView';
import { CouriersView } from './components/couriers/CouriersView';
import { IntegrationsView } from './components/integrations/IntegrationsView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { ExpensesView } from './components/expenses/ExpensesView';
import { SettingsView } from './components/settings/SettingsView';
import { HandoverView } from './components/handover/HandoverView';
import { AuthModal } from './components/auth/AuthModal';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { Order } from './types';
import { can, canAccessTab, defaultTabForRole } from './services/rbac';
import { getSessionUser, signOut, subscribeAuth, isDemoExplicitlyEnabled } from './lib/authSession';
import { isSupabaseConfigured } from './lib/supabase';
import { bootstrapCloudSession, applyBootstrapToUser } from './services/cloudBootstrap';
import { purgeLegacyCredentialStorage } from './services/channelIntegrations';
import supabaseRepo from './services/repositories/supabaseRepo';

export default function App() {
  const {
    state,
    currentUser,
    activeWorkspace,
    workspaces,
    members,
    products,
    orders,
    customers,
    couriers,
    shipments,
    expenses,
    notifications,
    stockMovements,
    whiteLabel,
    integrations,
    actions
  } = useOrderFlowStore();

  const [viewMode, setViewMode] = useState<'landing' | 'app'>('landing');
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<Order | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => document.documentElement.classList.contains('dark') || false);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (next) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  useEffect(() => {
    purgeLegacyCredentialStorage();
  }, []);

  const hydrateFromCloud = useCallback(
    async (preferredBusinessId?: string | null) => {
      if (!isSupabaseConfigured) return;
      setCloudLoading(true);
      try {
        const boot = await bootstrapCloudSession(preferredBusinessId);
        if (!boot.ok) return;
        if (boot.userRoleForActiveWorkspace) {
          actions.setCurrentUser(
            applyBootstrapToUser({ ...currentUser, role: boot.userRoleForActiveWorkspace }, boot)
          );
        }
        if (boot.activeBusinessId) actions.setActiveWorkspace(boot.activeBusinessId);
        if (typeof (actions as any).hydrateCloud === 'function') {
          (actions as any).hydrateCloud({
            workspaces: boot.workspaces || [],
            members: boot.members || [],
            products: boot.products || [],
            orders: boot.orders || [],
            customers: boot.customers || [],
            expenses: boot.expenses || [],
            integrations: boot.integrations || [],
            activeBusinessId: boot.activeBusinessId
          });
        }
      } finally {
        setCloudLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      if (isSupabaseConfigured) {
        const user = await getSessionUser();
        if (user) {
          actions.setCurrentUser(user);
          setIsAuthenticated(true);
          setViewMode('app');
          setCurrentTab(defaultTabForRole(user.role));
          await hydrateFromCloud();
        } else setIsAuthenticated(false);
        unsub = subscribeAuth(async (profile) => {
          if (profile) {
            actions.setCurrentUser(profile);
            setIsAuthenticated(true);
            await hydrateFromCloud();
          } else {
            setIsAuthenticated(false);
            setViewMode('landing');
          }
        });
      }
    })();
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requireAuthThen = (fn: () => void) => {
    if (isSupabaseConfigured && !isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!isSupabaseConfigured && viewMode !== 'app' && !isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }
    fn();
  };

  const handleLogout = async () => {
    await signOut();
    setIsAuthenticated(false);
    setViewMode('landing');
    setCurrentTab('dashboard');
  };

  useEffect(() => {
    if (viewMode !== 'app') return;
    if (!canAccessTab(currentUser.role, currentTab)) setCurrentTab(defaultTabForRole(currentUser.role));
  }, [currentUser.role, currentTab, viewMode]);

  const handleCreateOrder = async (orderData: any): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseConfigured && supabaseRepo.isAvailable() && activeWorkspace?.id) {
      const items = (orderData.items || []).map((it: any) => {
        const qty = Math.max(1, Number(it.quantity) || 1);
        const unit = Number(it.unitPrice ?? it.unit_price ?? it.price) || 0;
        return {
          product_id: it.productId || it.product_id,
          product_title: it.productTitle || it.product_title || it.title || 'Item',
          sku: it.sku || '',
          quantity: qty,
          unit_price: unit,
          unit_cost: Number(it.unitCost ?? it.unit_cost) || 0,
          total_price: qty * unit,
          variant_name: it.variantName || it.variant_name
        };
      });
      const subtotal = items.reduce((s: number, it: any) => s + it.total_price, 0);
      const discount = Number(orderData.discount) || 0;
      const delivery = Number(orderData.deliveryCharge ?? orderData.delivery_charge) || 0;
      const tax = Number(orderData.taxAmount ?? orderData.tax_amount) || 0;
      const total = Math.max(0, subtotal - discount + delivery + tax);

      const result = await supabaseRepo.createOrder({
        business_id: activeWorkspace.id,
        customer_name: orderData.customerName,
        customer_email: orderData.customerEmail,
        customer_phone: orderData.customerPhone,
        customer_id: orderData.customerId,
        payment_status: orderData.paymentStatus || 'unpaid',
        payment_method: orderData.paymentMethod || 'cod',
        currency: orderData.currencyCode || activeWorkspace.currency_code || activeWorkspace.currency,
        currency_symbol: orderData.currencySymbol || activeWorkspace.currency_symbol,
        subtotal,
        discount,
        delivery_charge: delivery,
        tax_amount: tax,
        total_amount: total,
        total_cost: items.reduce((s: number, it: any) => s + (it.unit_cost || 0) * it.quantity, 0),
        shipping_city: orderData.shippingCity,
        shipping_country_code: orderData.shippingCountryCode,
        shipping_address_json: orderData.shippingAddress || orderData.address,
        internal_notes: orderData.internalNotes,
        sales_channel: 'manual',
        items,
        idempotency_key: crypto.randomUUID()
      });

      if (result.success) {
        await hydrateFromCloud(activeWorkspace.id);
        return { success: true };
      }
      return { success: false, error: result.error };
    }
    const local = actions.createOrder(orderData) as any;
    return { success: Boolean(local?.success), error: local?.error };
  };

  const handleUpdateOrderStatus = async (orderId: string, st: string, note?: string) => {
    if (isSupabaseConfigured && supabaseRepo.isAvailable() && activeWorkspace?.id) {
      const result = await supabaseRepo.updateOrderStatus(orderId, activeWorkspace.id, st, note);
      if (result.success) await hydrateFromCloud(activeWorkspace.id);
      return result;
    }
    return actions.updateOrderStatus(orderId, st, note);
  };

  if (viewMode === 'app' && isSupabaseConfigured && !isAuthenticated) {
    return (
      <>
        <LandingPage whiteLabel={whiteLabel} onEnterApp={() => setIsAuthModalOpen(true)} onOpenAuth={() => setIsAuthModalOpen(true)} />
        <AuthModal
          isOpen={true}
          onClose={() => setViewMode('landing')}
          whiteLabel={whiteLabel}
          onAuthenticate={async (user) => {
            actions.setCurrentUser(user);
            setIsAuthenticated(true);
            setCurrentTab(defaultTabForRole(user.role));
            setViewMode('app');
            await hydrateFromCloud();
          }}
        />
      </>
    );
  }

  if (viewMode === 'landing') {
    return (
      <>
        <LandingPage
          whiteLabel={whiteLabel}
          onEnterApp={() =>
            requireAuthThen(() => {
              setIsAuthenticated(true);
              setViewMode('app');
            })
          }
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          whiteLabel={whiteLabel}
          onAuthenticate={async (user) => {
            actions.setCurrentUser(user);
            setIsAuthenticated(true);
            setCurrentTab(defaultTabForRole(user.role));
            setViewMode('app');
            await hydrateFromCloud();
          }}
        />
      </>
    );
  }

  const role = currentUser.role;

  return (
    <AppLayout
      currentTab={currentTab}
      onTabChange={(tab) => {
        if (canAccessTab(role, tab)) setCurrentTab(tab);
      }}
      workspace={activeWorkspace}
      workspaces={workspaces}
      currentUser={currentUser}
      whiteLabel={whiteLabel}
      notifications={notifications}
      isDarkMode={isDarkMode}
      onToggleDarkMode={toggleDarkMode}
      onSwitchWorkspace={async (id) => {
        actions.setActiveWorkspace(id);
        await hydrateFromCloud(id);
      }}
      onSwitchRole={(r) => {
        if (isSupabaseConfigured) return;
        if (isDemoExplicitlyEnabled()) actions.switchUserRole(r);
      }}
      onResetDemoData={() => {
        if (can(role, 'workspace:reset_demo') && !isSupabaseConfigured) actions.resetToDemoData();
      }}
      onOpenNewOrder={() => {
        if (can(role, 'orders:create')) setIsNewOrderModalOpen(true);
      }}
      onOpenOnboarding={() => {
        if (can(role, 'workspace:create')) setIsOnboardingOpen(true);
      }}
      onReturnToLanding={() => {
        void handleLogout();
      }}
      onMarkNotificationRead={(id) => actions.markNotificationAsRead(id)}
      onMarkAllNotificationsRead={() => actions.markAllNotificationsAsRead()}
    >
      {cloudLoading && <div className="px-4 py-2 text-sm text-slate-500">Loading workspace data…</div>}

      {currentTab === 'dashboard' && canAccessTab(role, 'dashboard') && (
        <DashboardView
          orders={orders}
          products={products}
          expenses={expenses}
          workspace={activeWorkspace}
          whiteLabel={whiteLabel}
          onNavigateTab={(tab) => {
            if (canAccessTab(role, tab)) setCurrentTab(tab);
          }}
          onOpenNewOrder={() => {
            if (can(role, 'orders:create')) setIsNewOrderModalOpen(true);
          }}
          onSelectOrder={(ord) => {
            setSelectedOrder(ord);
            setCurrentTab('orders');
          }}
        />
      )}

      {currentTab === 'orders' && canAccessTab(role, 'orders') && (
        <OrdersView
          orders={orders}
          products={products}
          customers={customers}
          workspace={activeWorkspace}
          whiteLabel={whiteLabel}
          selectedOrder={selectedOrder}
          onSelectOrder={setSelectedOrder}
          onOpenNewOrder={() => {
            if (can(role, 'orders:create')) setIsNewOrderModalOpen(true);
          }}
          onOpenInvoice={(ord) => setSelectedInvoiceOrder(ord)}
          onUpdateStatus={(orderId, st, note) => {
            if (can(role, 'orders:update_status')) void handleUpdateOrderStatus(orderId, st, note);
          }}
          onDeleteOrder={(orderId) => {
            if (can(role, 'orders:delete')) actions.deleteOrder(orderId);
          }}
          onBookCourier={(orderId, provider) => {
            if (can(role, 'couriers:book'))
              actions.createShipment({ order_id: orderId, courier_name: provider, is_manual: true });
          }}
        />
      )}

      {currentTab === 'inventory' && canAccessTab(role, 'inventory') && (
        <InventoryView
          products={products}
          stockMovements={stockMovements}
          workspace={activeWorkspace}
          whiteLabel={whiteLabel}
          onAddProduct={(prod) => {
            if (can(role, 'inventory:create')) actions.addProduct(prod);
          }}
          onUpdateProduct={(id, updates) => {
            if (can(role, 'inventory:edit')) actions.updateProduct(id, updates);
          }}
          onDeleteProduct={(id) => {
            if (can(role, 'inventory:delete')) actions.deleteProduct(id);
          }}
          onAdjustStock={(prodId, _varId, change, type, notes) => {
            if (can(role, 'inventory:adjust_stock'))
              actions.adjustStock(prodId, change, type || 'manual_adjustment', notes);
          }}
        />
      )}

      {currentTab === 'customers' && canAccessTab(role, 'customers') && (
        <CustomersView
          customers={customers}
          orders={orders}
          workspace={activeWorkspace}
          whiteLabel={whiteLabel}
          onAddCustomer={(c) => {
            if (can(role, 'customers:create')) actions.addCustomer(c);
          }}
          onUpdateCustomer={(id, updates) => {
            if (can(role, 'customers:edit')) actions.updateCustomer(id, updates);
          }}
          onDeleteCustomer={(id) => {
            if (can(role, 'customers:delete')) actions.deleteCustomer(id);
          }}
          onSelectOrder={(ord) => {
            setSelectedOrder(ord);
            setCurrentTab('orders');
          }}
        />
      )}

      {currentTab === 'couriers' && canAccessTab(role, 'couriers') && (
        <CouriersView
          couriers={couriers}
          shipments={shipments}
          orders={orders}
          workspace={activeWorkspace}
          whiteLabel={whiteLabel}
          onUpdateCourierConfig={(cid, updates) => {
            if (can(role, 'couriers:configure')) actions.updateCourierConfig(cid, updates);
          }}
          onCreateShipment={(orderId, provider) => {
            if (can(role, 'couriers:book'))
              actions.createShipment({ order_id: orderId, courier_name: provider, is_manual: true });
          }}
          onUpdateShipmentStatus={(sid, st) => actions.updateShipmentStatus(sid, st)}
          onSelectOrder={(ord) => {
            setSelectedOrder(ord);
            setCurrentTab('orders');
          }}
        />
      )}

      {currentTab === 'integrations' && canAccessTab(role, 'integrations') && (
        <IntegrationsView
          integrations={integrations.length ? integrations : state.integrations || []}
          workspace={activeWorkspace}
          whiteLabel={whiteLabel}
          onToggleConnection={(id, isConnected) => {
            if (can(role, 'integrations:manage')) actions.toggleIntegrationConnection(id, isConnected);
          }}
          onSyncOrders={(id) => {
            if (!can(role, 'integrations:sync')) return 0;
            return actions.syncChannelOrders(id) || 0;
          }}
          onImportOrders={(integrationId, channelOrders) => {
            if (!can(role, 'integrations:sync')) return 0;
            for (const o of channelOrders || []) {
              void handleCreateOrder({
                customerName: o.customer_name || 'Channel Customer',
                customerEmail: o.customer_email,
                customerPhone: o.customer_phone || 'n/a',
                shippingCity: o.shipping_address?.city || '',
                shippingCountryCode: o.shipping_address?.country_code,
                shippingAddress: o.shipping_address,
                currencyCode: o.currency || activeWorkspace.currency_code,
                items: (o.items || []).map((it: any) => ({
                  productTitle: it.product_title,
                  quantity: Math.max(1, Number(it.quantity) || 1),
                  unitPrice: Number(it.unit_price) || 0,
                  title: it.product_title,
                  price: Number(it.unit_price) || 0,
                  sku: it.sku
                })),
                paymentStatus: o.payment_status || 'unpaid',
                internalNotes: `Imported from ${o.channel} #${o.order_number || o.external_id}`
              });
            }
            const count = (channelOrders || []).length;
            if (count > 0) actions.syncChannelOrders(integrationId, count);
            return count;
          }}
        />
      )}

      {currentTab === 'analytics' && canAccessTab(role, 'analytics') && (
        <AnalyticsView orders={orders} expenses={expenses} products={products} workspace={activeWorkspace} whiteLabel={whiteLabel} />
      )}

      {currentTab === 'expenses' && canAccessTab(role, 'expenses') && (
        <ExpensesView
          expenses={expenses}
          workspace={activeWorkspace}
          whiteLabel={whiteLabel}
          onAddExpense={(e) => {
            if (can(role, 'expenses:manage')) actions.addExpense(e);
          }}
          onUpdateExpense={(id, updates) => {
            if (can(role, 'expenses:manage')) actions.updateExpense(id, updates);
          }}
          onDeleteExpense={(id) => {
            if (can(role, 'expenses:manage')) actions.deleteExpense(id);
          }}
        />
      )}

      {currentTab === 'settings' && canAccessTab(role, 'settings') && (
        <SettingsView
          workspace={activeWorkspace}
          workspaces={workspaces}
          members={members}
          currentUser={currentUser}
          whiteLabel={whiteLabel}
          orders={orders}
          customers={customers}
          products={products}
          onUpdateWorkspace={(id, updates) => {
            if (can(role, 'settings:workspace')) actions.updateWorkspace(id, updates);
          }}
          onUpdateWhiteLabel={(updates) => {
            if (can(role, 'settings:whitelabel')) actions.updateWhiteLabel(updates);
          }}
          onSwitchWorkspace={async (id) => {
            actions.setActiveWorkspace(id);
            await hydrateFromCloud(id);
          }}
          onResetDemoData={() => {
            if (can(role, 'workspace:reset_demo') && !isSupabaseConfigured) actions.resetToDemoData();
          }}
          onOpenOnboarding={() => {
            if (can(role, 'workspace:create')) setIsOnboardingOpen(true);
          }}
        />
      )}

      {currentTab === 'handover' && canAccessTab(role, 'handover') && <HandoverView />}

      <NewOrderModal
        isOpen={isNewOrderModalOpen && can(role, 'orders:create')}
        onClose={() => setIsNewOrderModalOpen(false)}
        products={products}
        customers={customers}
        workspace={activeWorkspace}
        whiteLabel={whiteLabel}
        onSubmit={async (orderData) => handleCreateOrder(orderData)}
      />

      <InvoiceModal
        order={selectedInvoiceOrder}
        workspace={activeWorkspace}
        whiteLabel={whiteLabel}
        isOpen={Boolean(selectedInvoiceOrder)}
        onClose={() => setSelectedInvoiceOrder(null)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        whiteLabel={whiteLabel}
        onAuthenticate={async (user) => {
          actions.setCurrentUser(user);
          setCurrentTab(defaultTabForRole(user.role));
          await hydrateFromCloud();
        }}
      />

      <OnboardingWizard
        isOpen={isOnboardingOpen && can(role, 'workspace:create')}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={async (ws, initialProd) => {
          if (isSupabaseConfigured && supabaseRepo.isAvailable()) {
            const created = await supabaseRepo.createWorkspace({
              name: ws.name,
              slug: ws.slug || ws.name.toLowerCase().replace(/\s+/g, '-'),
              country: ws.country,
              currency: ws.currency || ws.currency_code,
              currency_symbol: ws.currency_symbol,
              timezone: ws.timezone,
              email: ws.email,
              phone: ws.phone,
              address: ws.address || ws.address_line1,
              city: ws.city
            });
            if (created.success) {
              await hydrateFromCloud(created.data.business.id);
              if (initialProd && can(role, 'inventory:create')) {
                await supabaseRepo.createProduct({
                  ...(initialProd as any),
                  business_id: created.data.business.id,
                  title: (initialProd as any).title || (initialProd as any).name || 'Product'
                });
                await hydrateFromCloud(created.data.business.id);
              }
            }
          } else {
            actions.createWorkspace(ws);
            if (initialProd && can(role, 'inventory:create')) actions.addProduct(initialProd);
          }
        }}
      />
    </AppLayout>
  );
}
