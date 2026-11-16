import React, { useState } from 'react';
import {
  Product,
  Customer,
  BusinessWorkspace,
  WhiteLabelConfig,
  PaymentMethod,
  PaymentStatus,
  GlobalCourierProvider,
  OrderAddress
} from '../../types';
import { GLOBAL_COUNTRIES, CountryInfo, getCountryByCode } from '../../services/addressPhone';
import { GLOBAL_COURIERS } from '../../services/shipping';
import { formatCurrency } from '../../services/currency';
import { calculateOrderTax } from '../../services/tax';
import { useI18n } from '../../services/i18n';
import { X, Plus, Trash2, AlertCircle } from 'lucide-react';

interface NewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  customers: Customer[];
  workspace: BusinessWorkspace;
  whiteLabel: WhiteLabelConfig;
  onSubmit: (orderData: any) => { success: boolean; error?: string } | Promise<{ success: boolean; error?: string }>;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({
  isOpen,
  onClose,
  products,
  customers,
  workspace,
  onSubmit
}) => {
  const { t } = useI18n();

  const currencyCode = workspace.currency_code || 'USD';
  const defaultCountryCode = workspace.country_code || 'US';
  const defaultCountry = getCountryByCode(defaultCountryCode) || GLOBAL_COUNTRIES[0];

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo>(defaultCountry);
  const [phoneDialCode, setPhoneDialCode] = useState(defaultCountry.phoneCode);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [items, setItems] = useState<Array<{ productId: string; quantity: number; variantName?: string }>>([
    { productId: '', quantity: 1 }
  ]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('unpaid');
  const [discount, setDiscount] = useState(0);
  const [deliveryCharge, setDeliveryCharge] = useState(0);
  const [internalNotes, setInternalNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, it) => {
    const p = products.find((prod) => prod.id === it.productId);
    const unit = p ? Number((p as any).selling_price) || 0 : 0;
    return sum + unit * (Number(it.quantity) || 0);
  }, 0);

  const taxCalc = calculateOrderTax({
    subtotal,
    taxConfig: (workspace as any).tax_config,
    discount,
    deliveryCharge
  });

  const total =
    Math.max(0, subtotal - (Number(discount) || 0)) +
    (Number(deliveryCharge) || 0) +
    (taxCalc?.taxAmount || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!customerName.trim()) {
      setError('Customer name is required');
      return;
    }
    if (!items.length || items.some((it) => !it.productId || Number(it.quantity) <= 0)) {
      setError('Add at least one product with a positive quantity');
      return;
    }

    const fullPhone = `${phoneDialCode}${phoneNumber}`.trim();
    const orderAddress = {
      address_line1: addressLine1 || undefined,
      address_line2: addressLine2 || undefined,
      city,
      state_province_region: stateProvince || undefined,
      state_province: stateProvince || undefined,
      postal_zip_code: postalCode || undefined,
      postal_code: postalCode || undefined,
      country: selectedCountry.name,
      country_code: selectedCountry.code
    } as any;

    setSubmitting(true);
    try {
      const res = await onSubmit({
        customerId: selectedCustomerId || undefined,
        customerName,
        customerPhone: fullPhone,
        customerEmail: customerEmail || undefined,
        shippingAddress: orderAddress,
        shippingCity: city,
        address: orderAddress,
        shippingCountryCode: selectedCountry.code,
        shippingState: stateProvince,
        shippingPostalCode: postalCode,
        currencyCode: workspace.currency_code,
        currencySymbol: workspace.currency_symbol,
        items: items.map((it) => {
          const p = products.find((prod) => prod.id === it.productId);
          return {
            productId: it.productId,
            productTitle: (p as any)?.title || (p as any)?.name || 'Item',
            variantName: it.variantName,
            quantity: it.quantity,
            unitPrice: p ? Number((p as any).selling_price) || 0 : 0
          };
        }),
        paymentMethod,
        paymentStatus,
        discount: Number(discount) || 0,
        deliveryCharge: Number(deliveryCharge) || 0,
        taxAmount: taxCalc?.taxAmount || 0,
        internalNotes: internalNotes || undefined
      });

      if (!res?.success) {
        setError(res?.error || 'Failed to create order');
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-xl shadow-xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">New Order</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto mobile-scroll flex-1 min-h-0">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Customer name *</span>
              <input
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Existing customer</span>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={selectedCustomerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCustomerId(id);
                  const c = customers.find((x) => x.id === id);
                  if (c) {
                    setCustomerName(c.name);
                    setCustomerEmail(c.email || '');
                    setPhoneNumber((c.phone || '').replace(/^\+\d{1,3}/, ''));
                    setCity(c.city || '');
                  }
                }}
              >
                <option value="">New customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Country</span>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={selectedCountry.code}
                onChange={(e) => {
                  const c = getCountryByCode(e.target.value) || defaultCountry;
                  setSelectedCountry(c);
                  setPhoneDialCode(c.phoneCode);
                }}
              >
                {GLOBAL_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Phone</span>
              <div className="flex gap-1">
                <input
                  className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2"
                  value={phoneDialCode}
                  onChange={(e) => setPhoneDialCode(e.target.value)}
                />
                <input
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Email</span>
              <input
                type="email"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-slate-600 dark:text-slate-300">Address line 1</span>
              <input
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">City</span>
              <input
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Postal code</span>
              <input
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700 dark:text-slate-200">Items</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-indigo-600"
                onClick={() => setItems((prev) => [...prev, { productId: '', quantity: 1 }])}
              >
                <Plus className="w-3 h-3" /> Add line
              </button>
            </div>
            {items.map((it, idx) => (
              <div key={idx} className="flex flex-wrap gap-2 items-center">
                <select
                  className="flex-1 min-w-[140px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2"
                  value={it.productId}
                  onChange={(e) =>
                    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, productId: e.target.value } : row)))
                  }
                >
                  <option value="">Select product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p as any).title || (p as any).name} ({formatCurrency(Number((p as any).selling_price) || 0, currencyCode)})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-2"
                  value={it.quantity}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, quantity: Math.max(1, Number(e.target.value) || 1) } : row))
                    )
                  }
                />
                <button
                  type="button"
                  className="p-2 text-slate-400 hover:text-red-500"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Discount</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Delivery</span>
              <input
                type="number"
                min={0}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={deliveryCharge}
                onChange={(e) => setDeliveryCharge(Number(e.target.value) || 0)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Payment</span>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                <option value="cod">COD</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-slate-600 dark:text-slate-300">Pay status</span>
              <select
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
              >
                <option value="unpaid">Unpaid</option>
                <option value="partially_paid">Partially paid</option>
                <option value="paid">Paid</option>
              </select>
            </label>
          </div>

          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 flex justify-between text-slate-700 dark:text-slate-200">
            <span>Total</span>
            <span className="font-semibold">{formatCurrency(total, currencyCode)}</span>
          </div>

          <label className="block space-y-1">
            <span className="text-slate-600 dark:text-slate-300">Internal notes</span>
            <textarea
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 min-h-[60px]"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-60"
            >
              {submitting ? 'Creating…' : 'Create order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
