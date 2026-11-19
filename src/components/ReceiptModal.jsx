import { Printer, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatMoney, getPaymentMethodLabel } from '../utils/format.js';

export default function ReceiptModal({ receipt, onClose }) {
  const { t } = useTranslation();
  if (!receipt) return null;
  const currency = receipt.currency_code || 'RWF';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
      <div className="animate-scale-in bg-white dark:bg-slate-900 w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 no-print">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('components.receiptTitle')}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-sky-600 rounded hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              {t('components.printSavePdf')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded"
              aria-label={t('components.closeReceipt')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 text-xs text-slate-800 dark:text-slate-200 font-mono space-y-4 max-h-[82vh] overflow-y-auto">
          <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-4">
            <h4 className="text-base font-bold font-sans text-slate-900 dark:text-white">{receipt.business_name}</h4>
            <p className="text-slate-600 dark:text-slate-400">{receipt.branch_name}</p>
            <p className="text-slate-600 dark:text-slate-400">{receipt.business_address}</p>
            <p className="text-slate-600 dark:text-slate-400">{t('components.tel')}: {receipt.business_phone}</p>
            {receipt.business_tin && <p className="text-slate-500 dark:text-slate-400">{t('components.tin')}: {receipt.business_tin}</p>}
          </div>

          <div className="space-y-1 border-b border-dashed border-slate-300 dark:border-slate-700 pb-3">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{t('components.receiptNumber')}:</span>
              <span className="font-semibold">{receipt.receipt_number}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{t('components.saleRef')}:</span>
              <span>{receipt.reference_number}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{t('common.date')}:</span>
              <span>{formatDateTime(receipt.date)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{t('components.cashier')}:</span>
              <span>{receipt.cashier_name}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">{t('components.customer')}:</span>
              <span>{receipt.customer_name || t('components.walkInCustomer')}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-b border-dashed border-slate-300 dark:border-slate-700 pb-3">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1">{t('components.item')}</th>
                  <th className="py-1 text-right">{t('components.qty')}</th>
                  <th className="py-1 text-right">{t('common.total')}</th>
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
          </div>

          <div className="space-y-1.5 pt-1 tabular-nums">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{t('common.subtotal')}</span>
              <span>{formatMoney(receipt.subtotal, currency)}</span>
            </div>
            {Number(receipt.discount_amount) > 0 && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>{t('common.discount')}</span>
                <span>-{formatMoney(receipt.discount_amount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{t('common.tax')} ({receipt.tax_rate || 0}%)</span>
              <span>{formatMoney(receipt.tax_amount, currency)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-white border-t border-slate-300 dark:border-slate-700 pt-2">
              <span>{t('common.total').toUpperCase()}</span>
              <span>{formatMoney(receipt.total_amount, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">{t('components.amountPaid')}</span>
              <span className="font-semibold">{formatMoney(receipt.amount_paid, currency)}</span>
            </div>
            {Number(receipt.balance_due) > 0 && (
              <div className="flex justify-between text-rose-700 dark:text-rose-400 font-semibold">
                <span>{t('components.balanceDue')}</span>
                <span>{formatMoney(receipt.balance_due, currency)}</span>
              </div>
            )}
            {Array.isArray(receipt.payments) && receipt.payments.length > 0 && (
              <div className="pt-2 border-t border-dashed border-slate-300 dark:border-slate-700 space-y-1">
                <div className="text-slate-500 dark:text-slate-400">{t('components.payments')}:</div>
                {receipt.payments.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{getPaymentMethodLabel(p.payment_method)}</span>
                    <span>{formatMoney(p.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-center text-[11px] text-slate-500 dark:text-slate-400 pt-3 border-t border-dashed border-slate-300 dark:border-slate-700">
            {t('components.receiptFooter')}
          </div>
        </div>
      </div>
    </div>
  );
}
