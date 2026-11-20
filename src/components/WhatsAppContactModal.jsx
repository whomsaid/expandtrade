import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { formatDateTime } from '../utils/format.js';
import { buildWhatsAppDeepLink, normalizePhoneClient } from '../utils/phone.js';

export function WhatsAppContactModal({
  open,
  onClose,
  phone,
  name,
  customerId = null,
  entityType = null,
  entityId = null,
  prefillMessage = '',
  whatsappOptIn = null,
  hasWhatsapp = null,
  optedOutAt = null,
  onConsentChanged = null,
}) {
  const { t } = useTranslation();
  const { activeBusinessId, socket } = useAuth();
  const [messages, setMessages] = useState([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(prefillMessage || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [optInState, setOptInState] = useState(whatsappOptIn);
  const [optedOutState, setOptedOutState] = useState(optedOutAt);

  useEffect(() => {
    setOptInState(whatsappOptIn);
    setOptedOutState(optedOutAt);
  }, [whatsappOptIn, optedOutAt, open]);

  useEffect(() => {
    if (open) {
      setDraft(prefillMessage || '');
      setError('');
      setNotice('');
    }
  }, [open, prefillMessage]);

  const phoneCheck = normalizePhoneClient(phone);
  const normalizedPhone = phoneCheck.valid ? phoneCheck.e164 : phone;
  const waMeUrl = buildWhatsAppDeepLink(normalizedPhone, draft || prefillMessage);

  const loadMessages = useCallback(async () => {
    if (!open || !activeBusinessId || !normalizedPhone) return;
    setLoading(true);
    try {
      const { data } = await api.get('/whatsapp/messages', {
        params: {
          phone: normalizedPhone,
          ...(customerId ? { customer_id: customerId } : {}),
          limit: 40,
        },
      });
      setMessages(data.messages || []);
      setConfigured(Boolean(data.configured));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [open, activeBusinessId, normalizedPhone, customerId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!open || !socket || !normalizedPhone) return undefined;
    const onMessage = (msg) => {
      if (msg?.phone_e164 === normalizedPhone) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    };
    const onStatus = (st) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === st.messageId || (st.externalMessageId && m.external_message_id === st.externalMessageId)
            ? { ...m, status: st.status, error_code: st.errorCode || m.error_code, error_message: st.errorMessage || m.error_message }
            : m
        )
      );
    };
    socket.on('whatsapp:message', onMessage);
    socket.on('whatsapp:status', onStatus);
    return () => {
      socket.off('whatsapp:message', onMessage);
      socket.off('whatsapp:status', onStatus);
    };
  }, [open, socket, normalizedPhone]);

  if (!open) return null;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    setError('');
    setNotice('');
    setSending(true);
    try {
      const { data } = await api.post('/whatsapp/send', {
        phone: normalizedPhone,
        message: draft.trim(),
        ...(customerId ? { customer_id: customerId } : {}),
        ...(entityType ? { entity_type: entityType } : {}),
        ...(entityId ? { entity_id: entityId } : {}),
      });
      if (data.sent_via === 'cloud_api' && data.data) {
        setMessages((prev) => [...prev, data.data]);
        setDraft('');
        setNotice(t('whatsapp.sentViaApi'));
      } else {
        setNotice(data.message || t('whatsapp.useDirectLink'));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleToggleConsent = async () => {
    if (!customerId) return;
    setError('');
    setNotice('');
    try {
      const nextVal = !optInState;
      const { data } = await api.patch('/whatsapp/consent', {
        customer_id: customerId,
        whatsapp_opt_in: nextVal,
      });
      setOptInState(Boolean(data.whatsapp_opt_in));
      setOptedOutState(data.whatsapp_opt_in ? null : new Date().toISOString());
      setNotice(data.message);
      if (onConsentChanged) onConsentChanged(Boolean(data.whatsapp_opt_in));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 dark:bg-slate-950/80 p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0B192C] dark:text-white">
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">{name || t('whatsapp.contactTitle')}</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              <span className="font-mono">{normalizedPhone || '—'}</span>
              {hasWhatsapp === 'no' && <> · <span className="text-rose-600 dark:text-rose-400 font-medium">{t('whatsapp.notOnWhatsapp')}</span></>}
              {optedOutState && <> · <span className="text-amber-700 dark:text-amber-400 font-medium">{t('whatsapp.optedOut')}</span></>}
              {optInState && !optedOutState && <> · <span className="text-emerald-700 dark:text-emerald-400 font-medium">{t('whatsapp.optedIn')}</span></>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && <div className="p-3 text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
          {notice && <div className="p-3 text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}

          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="space-y-0.5">
              <div className="font-semibold text-slate-800 dark:text-slate-100">{t('whatsapp.directLaunchTitle')}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {configured ? t('whatsapp.apiReadyHint') : t('whatsapp.apiFallbackHint')}
              </div>
            </div>
            {waMeUrl && hasWhatsapp !== 'no' ? (
              <a
                href={waMeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t('whatsapp.openInWhatsApp')}
              </a>
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">{t('whatsapp.validPhoneNeeded')}</span>
            )}
          </div>

          {customerId && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-300">{t('whatsapp.customerConsentLabel')}</span>
              <button
                type="button"
                onClick={handleToggleConsent}
                className="font-semibold text-sky-700 dark:text-sky-400 hover:underline"
              >
                {optInState && !optedOutState ? t('whatsapp.markOptedOut') : t('whatsapp.markOptedIn')}
              </button>
            </div>
          )}

          <div className="space-y-2">
            <div className="font-semibold text-slate-700 dark:text-slate-200">{t('whatsapp.conversationHistory')}</div>
            {loading ? (
              <div className="py-6 text-center text-slate-400">{t('common.loadingData')}</div>
            ) : messages.length === 0 ? (
              <div className="py-6 text-center text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                {t('whatsapp.noMessagesYet')}
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-lg border ${
                      m.direction === 'inbound'
                        ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 mr-6'
                        : 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 ml-6'
                    }`}
                  >
                    <div className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">{m.body}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>{m.direction === 'inbound' ? t('whatsapp.inboundTag') : (m.sent_by_name || t('whatsapp.outboundTag'))} · {formatDateTime(m.created_at)}</span>
                      <span className={m.status === 'failed' ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}>
                        {m.status}
                      </span>
                    </div>
                    {m.error_message && (
                      <div className="mt-1 text-[10px] text-rose-700 dark:text-rose-300">{m.error_message}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {configured && phoneCheck.valid && !optedOutState && hasWhatsapp !== 'no' && (
            <form onSubmit={handleSend} className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('whatsapp.typeMessagePlaceholder')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-55"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sending ? t('whatsapp.sending') : t('whatsapp.sendMessage')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function WhatsAppContactButton({
  phone,
  name,
  customerId = null,
  entityType = null,
  entityId = null,
  prefillMessage = '',
  whatsappOptIn = null,
  hasWhatsapp = null,
  optedOutAt = null,
  compact = false,
  className = '',
  onConsentChanged = null,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const phoneCheck = normalizePhoneClient(phone);
  if (!phoneCheck.valid) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('whatsapp.contactTitle')}
        className={`inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:underline font-medium whitespace-nowrap ${
          compact ? 'text-[11px]' : 'text-xs'
        } ${className}`}
      >
        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{compact ? 'WhatsApp' : t('whatsapp.messageBtn')}</span>
      </button>

      {open && (
        <WhatsAppContactModal
          open={open}
          onClose={() => setOpen(false)}
          phone={phone}
          name={name}
          customerId={customerId}
          entityType={entityType}
          entityId={entityId}
          prefillMessage={prefillMessage}
          whatsappOptIn={whatsappOptIn}
          hasWhatsapp={hasWhatsapp}
          optedOutAt={optedOutAt}
          onConsentChanged={onConsentChanged}
        />
      )}
    </>
  );
}
