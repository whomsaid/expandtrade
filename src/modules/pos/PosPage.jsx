import { useCallback, useEffect, useState } from 'react';
import { Minus, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import ReceiptModal from '../../components/ReceiptModal.jsx';
import { formatMoney, PAYMENT_METHOD_LABELS } from '../../utils/format.js';

export default function PosPage() {
  const { activeBusinessId, activeBranchId, workspace, hasPermission } = useAuth();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [payments, setPayments] = useState([{ payment_method: 'cash', amount: '', external_reference: '' }]);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const currency = workspace?.business?.currency_code || 'RWF';
  const taxEnabled = Boolean(workspace?.business?.tax_enabled);
  const taxRate = taxEnabled ? Number(workspace?.business?.default_tax_rate || 0) : 0;
  const enabledMethods = workspace?.settings?.enabled_payment_methods || [
    'cash',
    'mtn_momo',
    'airtel_money',
    'bank_transfer',
    'card',
  ];

  const loadPosCatalog = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      const [prodRes, custRes] = await Promise.all([
        api.get('/products', { params: { status: 'active', limit: 150 } }),
        api.get('/customers'),
      ]);
      setProducts(prodRes.data.products || []);
      setCustomers(custRes.data.customers || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId, activeBranchId]);

  useEffect(() => {
    loadPosCatalog();
  }, [loadPosCatalog]);

  const filteredProducts = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  });

  const addToCart = (product) => {
    setError('');
    if (product.quantity <= 0) {
      setError(`${product.name} is out of stock in the active branch.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) {
          setError(`Only ${product.quantity} units of ${product.name} available.`);
          return prev;
        }
        return prev.map((i) => (i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          unit_price: Number(product.selling_price),
          max_stock: Number(product.quantity),
          quantity: 1,
        },
      ];
    });
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && search.trim()) {
      const exactBarcode = products.find(
        (p) => p.barcode?.toLowerCase() === search.trim().toLowerCase() || p.sku.toLowerCase() === search.trim().toLowerCase()
      );
      if (exactBarcode) {
        e.preventDefault();
        addToCart(exactBarcode);
        setSearch('');
      }
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const discount = Math.max(0, Number(discountAmount || 0));
  const taxable = Math.max(0, subtotal - discount);
  const taxAmount = Math.round(((taxable * taxRate) / 100) * 100) / 100;
  const total = Math.round((taxable + taxAmount) * 100) / 100;

  const totalTendered = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const balanceDue = Math.max(0, Math.round((total - totalTendered) * 100) / 100);

  const fillExactTotal = () => {
    setPayments([{ payment_method: payments[0]?.payment_method || 'cash', amount: String(total), external_reference: payments[0]?.external_reference || '' }]);
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return setError('Add at least one product to the cart.');
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        items: cart.map((c) => ({ product_id: c.product_id, quantity: c.quantity })),
        customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
        discount_amount: discount,
        payments: payments
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({
            payment_method: p.payment_method,
            amount: Number(p.amount),
            external_reference: p.external_reference,
          })),
        idempotency_key: idempotencyKey,
      };
      const { data } = await api.post('/sales', payload);
      setReceipt(data.receipt);
      setCart([]);
      setDiscountAmount('0');
      setPayments([{ payment_method: 'cash', amount: '', external_reference: '' }]);
      setIdempotencyKey(`pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await loadPosCatalog();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Product Grid */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search product name or scan barcode / SKU (press Enter)..."
            className="w-full text-sm outline-none bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addToCart(p)}
              disabled={p.quantity <= 0}
              className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-left hover:border-sky-600 dark:hover:border-sky-500 transition-colors disabled:opacity-50 flex flex-col justify-between space-y-2"
            >
              <div>
                <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">{p.sku}</div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 mt-0.5">{p.name}</div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-[#0B192C] dark:text-sky-400 tabular-nums">{formatMoney(p.selling_price, currency)}</span>
                <span className={`text-[11px] tabular-nums ${p.quantity <= 0 ? 'text-rose-600 dark:text-rose-400' : p.quantity <= p.min_stock ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {p.quantity} left
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Checkout Cart */}
      <div className="lg:col-span-5">
        <form onSubmit={handleCheckout} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 sticky top-20">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Current Sale Cart ({cart.length})
            </h2>
            {cart.length > 0 && (
              <button type="button" onClick={() => setCart([])} className="text-xs text-rose-600 dark:text-rose-400 hover:underline">
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="p-2.5 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
              {error}
            </div>
          )}

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">Select products on the left to start checkout.</div>
            ) : (
              cart.map((item) => (
                <div key={item.product_id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{item.name}</div>
                    <div className="text-slate-500 dark:text-slate-400 tabular-nums">{formatMoney(item.unit_price, currency)}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) =>
                          prev
                            .map((i) => (i.product_id === item.product_id ? { ...i, quantity: i.quantity - 1 } : i))
                            .filter((i) => i.quantity > 0)
                        )
                      }
                      className="p-1 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center font-semibold tabular-nums text-slate-900 dark:text-slate-100">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) =>
                          prev.map((i) =>
                            i.product_id === item.product_id && i.quantity < i.max_stock
                              ? { ...i, quantity: i.quantity + 1 }
                              : i
                          )
                        )
                      }
                      className="p-1 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((i) => i.product_id !== item.product_id))}
                      className="p-1 text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Customer</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Walk-in Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>
              {hasPermission('pos.discount') && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Discount ({currency})</label>
                  <input
                    type="number"
                    min="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-slate-50 dark:bg-slate-800/70 p-3 rounded-lg space-y-1.5 tabular-nums border border-slate-200/70 dark:border-slate-700">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal, currency)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>Discount</span>
                  <span>-{formatMoney(discount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Tax ({taxRate}%)</span>
                <span>{formatMoney(taxAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-[#0B192C] dark:text-slate-100 border-t border-slate-200 dark:border-slate-700 pt-1.5">
                <span>Total Due</span>
                <span>{formatMoney(total, currency)}</span>
              </div>
            </div>

            {/* Payments (Split / Partial / Mobile Money) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Payment Methods</span>
                <div className="space-x-2">
                  <button type="button" onClick={fillExactTotal} className="text-sky-700 dark:text-sky-400 hover:underline font-medium">
                    Fill Exact Total
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayments((p) => [...p, { payment_method: 'mtn_momo', amount: '', external_reference: '' }])}
                    className="text-slate-600 dark:text-slate-400 hover:underline"
                  >
                    + Split Payment
                  </button>
                </div>
              </div>

              {payments.map((pay, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <select
                    value={pay.payment_method}
                    onChange={(e) =>
                      setPayments((prev) => prev.map((x, i) => (i === idx ? { ...x, payment_method: e.target.value } : x)))
                    }
                    className="col-span-5 px-2 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {enabledMethods.map((m) => (
                      <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] || m}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    placeholder="Amount"
                    value={pay.amount}
                    onChange={(e) =>
                      setPayments((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))
                    }
                    className="col-span-4 px-2 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                  />
                  <input
                    placeholder="Ref / MoMo ID"
                    value={pay.external_reference}
                    onChange={(e) =>
                      setPayments((prev) => prev.map((x, i) => (i === idx ? { ...x, external_reference: e.target.value } : x)))
                    }
                    className="col-span-3 px-2 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
              ))}

              {balanceDue > 0 && cart.length > 0 && (
                <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium tabular-nums">
                  Remaining balance of {formatMoney(balanceDue, currency)} will be recorded as customer receivable.
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || cart.length === 0}
              className="w-full py-3 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Processing Sale...' : `Complete Sale · ${formatMoney(total, currency)}`}
            </button>
          </div>
        </form>
      </div>

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
