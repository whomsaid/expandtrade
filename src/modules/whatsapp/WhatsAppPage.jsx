import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../services/api.js';
import { formatDateTime } from '../../utils/format.js';
import { buildWhatsAppDeepLink, normalizePhoneClient } from '../../utils/phone.js';

export default function WhatsAppPage() {
  const { t } = useTranslation();
  const { activeBusinessId, workspace, socket } = useAuth();
  const [status, setStatus] = useState({ configured: false, smsConfigured: false, verifyTokenConfigured: false, appSecretConfigured: false });
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ phone: '+250', message: '' });
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeBusinessId) return;
    setLoading(true);
    setError('');
    try {
      const [stRes, msgRes] = await Promise.all([
        api.get('/whatsapp/status'),
        api.get('/whatsapp/messages', { params: { limit: 60 } }),
      ]);
      setStatus(stRes.data || {});
      setMessages(msgRes.data?.messages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!socket) return undefined;
    const onMessage = (msg) => {
      if (!msg?.id) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
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
  }, [socket]);

  const phoneCheck = normalizePhoneClient(form.phone);
  const directLink = buildWhatsAppDeepLink(form.phone, form.message);
  const businessWaLink = buildWhatsAppDeepLink(workspace?.business?.whatsapp_number || workspace?.business?.phone || '');

  const handleSend = async (e) => {
    e.preventDefault();
    if (sending) return;
    setError('');
    setNotice('');
    if (!phoneCheck.valid) {
      setError(phoneCheck.error);
      return;
    }
    if (!form.message.trim()) {
      setError(t('whatsapp.enterMessagePrompt'));
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post('/whatsapp/send', {
        phone: phoneCheck.e164,
        message: form.message.trim(),
      });
      if (data.sent_via === 'cloud_api' && data.data) {
        setMessages((prev) => [...prev, data.data]);
        setForm((prev) => ({ ...prev, message: '' }));
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('whatsapp.hubTitle')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('whatsapp.hubSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {businessWaLink && (
            <a
              href={businessWaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('whatsapp.businessNumberLink')}
            </a>
          )}
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
      {notice && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-slate-500 dark:text-slate-400">{t('whatsapp.cloudApiStatus')}</div>
          <div className={`text-sm font-bold ${status.configured ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {status.configured ? t('whatsapp.statusConfigured') : t('whatsapp.statusDirectLinkOnly')}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-slate-500 dark:text-slate-400">{t('whatsapp.webhookSecurity')}</div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">
            {status.verifyTokenConfigured ? t('whatsapp.webhookVerifiedReady') : t('whatsapp.webhookTokenMissing')}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-slate-500 dark:text-slate-400">{t('whatsapp.loggedMessages')}</div>
          <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{messages.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form onSubmit={handleSend} className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-[#0B192C] dark:text-white">
            <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{t('whatsapp.composeTitle')}</span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
            {status.configured ? t('whatsapp.apiReadyHint') : t('whatsapp.apiFallbackHint')}
          </p>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('whatsapp.recipientPhone')}</label>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+250788123456"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('whatsapp.messageBody')}</label>
            <textarea
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder={t('whatsapp.typeMessagePlaceholder')}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {directLink ? (
              <a
                href={directLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t('whatsapp.openInWhatsApp')}
              </a>
            ) : (
              <span className="text-[11px] text-slate-400">{t('whatsapp.validPhoneNeeded')}</span>
            )}

            {status.configured && (
              <button
                type="submit"
                disabled={sending || !phoneCheck.valid || !form.message.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-55"
              >
                <Send className="w-3.5 h-3.5" />
                {sending ? t('whatsapp.sending') : t('whatsapp.sendViaApi')}
              </button>
            )}
          </div>
        </form>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
          <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('whatsapp.recentThreads')}</h2>
          {loading ? (
            <div className="py-10 text-center text-slate-400">{t('common.loadingData')}</div>
          ) : messages.length === 0 ? (
            <div className="py-10 text-center text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
              {t('whatsapp.noMessagesYet')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[28rem] overflow-y-auto">
              {[...messages].reverse().map((m) => (
                <div key={m.id} className="py-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">{m.phone_e164}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {m.direction === 'inbound' ? t('whatsapp.inboundTag') : t('whatsapp.outboundTag')} · {m.status} · {formatDateTime(m.created_at)}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{m.body}</div>
                  {m.error_message && <div className="text-[11px] text-rose-600 dark:text-rose-400">{m.error_message}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
