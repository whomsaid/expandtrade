import { Printer, X } from 'lucide-react';
import { formatDateTime, formatMoney, PAYMENT_METHOD_LABELS } from '../utils/format.js';

export default function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;
  const currency = receipt.currency_code || 'RWF';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
      <div className="animate-scale-in bg-white dark:bg-slate-900 w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 no-print">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">POS Sale Receipt</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-sky-600 rounded hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded"
              aria-label="Close receipt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 text-xs text-slate-800 dark:text-slate-200 font-mono space-y-4">
          <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
            <h4 className="text-base font-bold font-sans text-slate-900 dark:text-white">{receipt.business_name}</h4>
            <p className="text-slate-600 dark:text-slate-400">{receipt.branch_name}</p>
            <p className="text-slate-600 dark:text-slate-400">{receipt.business_address}</p>
            <p className="text-slate-600 dark:text-slate-400">Tel: {receipt.business_phone}</p>
            {receipt.business_tin && <p className="text-slate-500 dark:text-slate-400">TIN: {receipt.business_tin}</p>}
          </div>

          <div className="space-y-1 border-b border-dashed border-slate-300 dark:border-slate-700 pb-3">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Receipt #:</span>
              <span className="font-semibold">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Sale Ref:</span>
              <span>{receipt.reference_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Date:</span>
              <span>{formatDateTime(receipt.date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Cashier:</span>
              <span>{receipt.cashier_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Customer:</span>
              <span>{receipt.customer_name || 'Walk-in Customer'}</span>
            </div>
          </div>

          <table className="w-full text-left border-b border-dashed border-slate-300 dark:border-slate-700 pb-3">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="py-1">Item</th>
                <th className="py-1 text-right">Qty</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(receipt.items || []).map((item, idx) => (
                <tr key={idx}>
                  <td className="py-1.5 pr-2">
                    <div className="font-medium text-slate-900 dark:text-white">{item.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{formatMoney(item.unit_price, currency)}</div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{formatMoney(item.line_total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1.5 pt-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
              <span>{formatMoney(receipt.subtotal, currency)}</span>
            </div>
            {Number(receipt.discount_amount) > 0 && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Discount</span>
                <span>-{formatMoney(receipt.discount_amount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Tax ({receipt.tax_rate || 0}%)</span>
              <span>{formatMoney(receipt.tax_amount, currency)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white border-t border-slate-300 dark:border-slate-700 pt-2">
              <span>TOTAL</span>
              <span>{formatMoney(receipt.total_amount, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Amount Paid</span>
              <span className="font-semibold">{formatMoney(receipt.amount_paid, currency)}</span>
            </div>
            {Number(receipt.balance_due) > 0 && (
              <div className="flex justify-between text-rose-700 dark:text-rose-400 font-semibold">
                <span>Balance Due</span>
                <span>{formatMoney(receipt.balance_due, currency)}</span>
              </div>
            )}
            {Array.isArray(receipt.payments) && receipt.payments.length > 0 && (
              <div className="pt-2 border-t border-dashed border-slate-300 dark:border-slate-700 space-y-1">
                <div className="text-slate-500 dark:text-slate-400">Payments:</div>
                {receipt.payments.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</span>
                    <span>{formatMoney(p.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-center text-[11px] text-slate-500 dark:text-slate-400 pt-3 border-t border-dashed border-slate-300 dark:border-slate-700">
            Thank you for your business. Powered by BizFlow Africa.
          </div>
        </div>
      </div>
    </div>
  );
}
