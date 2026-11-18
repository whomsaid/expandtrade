import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Send } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AiAssistantPage() {
  const { t } = useTranslation();
  const { workspace } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const suggestions = [
    t('ai.s1'),
    t('ai.s2'),
    t('ai.s3'),
    t('ai.s4'),
    t('ai.s5'),
  ];

  const handleAsk = async (questionText) => {
    const q = (questionText ?? prompt).trim();
    if (!q) return;
    setError('');
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    if (!questionText) setPrompt('');

    try {
      const { data } = await api.post('/ai/ask', { prompt: q });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer,
          provider: data.provider,
        },
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('ai.title')}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('ai.subtitle', { business: workspace?.business?.name || 'BizTrade Africa' })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => handleAsk(s)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-sky-600 dark:hover:border-sky-500 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col min-h-[420px]">
        <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[520px]">
          {messages.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Bot className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t('ai.emptyTitle')}</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {t('ai.emptyDesc')}
              </p>
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#0B192C] dark:bg-sky-600 text-white ml-12'
                    : 'bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 mr-12'
                }`}
              >
                {m.text}
              </div>
            ))
          )}
          {loading && <div className="text-xs text-slate-500 dark:text-slate-400">{t('ai.analyzing')}</div>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2"
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('ai.placeholder')}
            className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {t('ai.askBtn')}
          </button>
        </form>
      </div>
    </div>
  );
}
