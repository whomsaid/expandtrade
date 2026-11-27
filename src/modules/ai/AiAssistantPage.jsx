import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Globe,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

const ROLE_OPTIONS = [
  { id: 'business_advisor', labelKey: 'ai.roleBusinessAdvisor' },
  { id: 'market_researcher', labelKey: 'ai.roleMarketResearcher' },
  { id: 'operations_analyst', labelKey: 'ai.roleOperationsAnalyst' },
  { id: 'quick_helper', labelKey: 'ai.roleQuickHelper' },
];

const MODEL_OPTIONS = [
  { id: 'gemini-4-hydrogen', labelKey: 'ai.modelHydrogen' },
  { id: 'gemini-3.1-flash-lite', labelKey: 'ai.modelFlashLite' },
];

export default function AiAssistantPage() {
  const { t } = useTranslation();
  const { workspace } = useAuth();

  const [activeTab, setActiveTab] = useState('chat');

  // Multi-turn Chatbot state
  const [rolePreset, setRolePreset] = useState('business_advisor');
  const [customInstruction, setCustomInstruction] = useState('');
  const [model, setModel] = useState('gemini-4-hydrogen');
  const [useSearch, setUseSearch] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(null);
  const threadEndRef = useRef(null);

  // Google Search Grounding tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, chatLoading]);

  const chatSuggestions = [
    t('ai.s1'),
    t('ai.s2'),
    t('ai.s3'),
    t('ai.s4'),
    t('ai.s5'),
  ];

  const webSearchPrompts = [
    t('ai.webSearchPrompt1'),
    t('ai.webSearchPrompt2'),
    t('ai.webSearchPrompt3'),
    t('ai.webSearchPrompt4'),
  ];

  const handleCopy = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1600);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleSendChat = async (overrideText) => {
    const text = (overrideText ?? prompt).trim();
    if (!text || chatLoading) return;

    const historySnapshot = messages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      text: m.text,
    }));

    setChatError('');
    setChatLoading(true);
    setMessages((prev) => [...prev, { role: 'user', text }]);
    if (!overrideText) setPrompt('');

    try {
      const { data } = await api.post('/ai/chat', {
        message: text,
        history: historySnapshot,
        rolePreset,
        customSystemInstruction: customInstruction.trim() || undefined,
        model: useSearch ? 'gemini-4-hydrogen' : model,
        useSearch,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer,
          model: data.model || model,
          searchGrounded: Boolean(data.searchGrounded),
          groundingSources: data.groundingSources || [],
          searchQueries: data.searchQueries || [],
        },
      ]);
    } catch (err) {
      setChatError(err.message);
    } finally {
      setChatLoading(false);
    }
  };

  const handleWebSearch = async (overrideQuery) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q || searchLoading) return;
    if (overrideQuery) setSearchQuery(overrideQuery);

    setSearchError('');
    setSearchLoading(true);
    try {
      const { data } = await api.post('/ai/search', { query: q });
      setSearchResult(data);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header + Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('ai.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('ai.subtitle', { business: workspace?.business?.name || 'BizTrade Africa' })}
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg self-start shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-white dark:bg-slate-900 text-[#0B192C] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>{t('ai.tabChat')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'search'
                ? 'bg-white dark:bg-slate-900 text-[#0B192C] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t('ai.tabSearch')}</span>
          </button>
        </div>
      </div>

      {activeTab === 'chat' ? (
        <div className="space-y-4">
          {/* Chatbot Role, Model & Search Grounding Configuration */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('ai.roleLabel')}
                </label>
                <select
                  value={rolePreset}
                  onChange={(e) => setRolePreset(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('ai.modelLabel')}
                </label>
                <select
                  value={useSearch ? 'gemini-4-hydrogen' : model}
                  disabled={useSearch}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-70"
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4 flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={useSearch}
                    onChange={(e) => setUseSearch(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500"
                  />
                  <Globe className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                  <span className="truncate">{t('ai.useGoogleSearch')}</span>
                </label>

                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      setChatError('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('ai.newChat')}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-8">
                <input
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  placeholder={t('ai.customRolePlaceholder')}
                  aria-label={t('ai.customRoleLabel')}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
              </div>
              <div className="md:col-span-4 text-[11px] text-slate-500 dark:text-slate-400">
                {useSearch ? t('ai.searchForcesHydrogen') : t('ai.paidTierNotice')}
              </div>
            </div>
          </div>

          {/* Prompt Suggestions */}
          <div className="flex flex-wrap gap-2">
            {chatSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={chatLoading}
                onClick={() => handleSendChat(s)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-sky-600 dark:hover:border-sky-500 transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          {chatError && (
            <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
              {chatError}
            </div>
          )}

          {/* Scrollable Multi-Turn Conversation Thread */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col min-h-[430px]">
            <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[540px]">
              {messages.length === 0 ? (
                <div className="py-14 text-center space-y-2.5">
                  <Sparkles className="w-8 h-8 text-sky-700 dark:text-sky-400 mx-auto" />
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {t('ai.emptyTitle')}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {t('ai.emptyDesc')}
                  </p>
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl text-sm leading-relaxed space-y-2.5 ${
                      m.role === 'user'
                        ? 'bg-[#0B192C] dark:bg-sky-600 text-white ml-8 sm:ml-14'
                        : 'bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 mr-8 sm:mr-14'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.text}</div>

                    {m.role !== 'user' && (
                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Zap className="w-3 h-3 text-sky-700 dark:text-sky-400" />
                            {m.model || 'gemini-4-hydrogen'}
                          </span>
                          {m.searchGrounded && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                                <Globe className="w-3 h-3" />
                                Google Search
                              </span>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(m.text, idx)}
                          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                        >
                          {copiedIdx === idx ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedIdx === idx ? t('ai.copied') : t('ai.copyBtn')}</span>
                        </button>
                      </div>
                    )}

                    {m.groundingSources?.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {t('ai.sourcesTitle')}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {m.groundingSources.map((src) => (
                            <a
                              key={src.uri}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-sky-700 dark:text-sky-400 hover:underline max-w-xs"
                            >
                              <span className="truncate">{src.title}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}

              {chatLoading && (
                <div className="text-xs text-slate-500 dark:text-slate-400">{t('ai.analyzing')}</div>
              )}
              <div ref={threadEndRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
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
                disabled={chatLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                {t('ai.askBtn')}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Live Google Search Grounding Research Tab */
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('ai.webSearchTitle')}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('ai.webSearchDesc')}</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleWebSearch();
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('ai.webSearchPlaceholder')}
                  className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={searchLoading}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Globe className="w-4 h-4" />
                {t('ai.webSearchBtn')}
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              {webSearchPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={searchLoading}
                  onClick={() => handleWebSearch(q)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-sky-600 dark:hover:border-sky-500 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {searchError && (
            <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
              {searchError}
            </div>
          )}

          {searchLoading && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              {t('ai.analyzing')}
            </div>
          )}

          {searchResult && !searchLoading && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                {searchResult.answer}
              </div>

              {searchResult.searchQueries?.length > 0 && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-semibold">{t('ai.queriesLabel')}:</span>{' '}
                  {searchResult.searchQueries.join(' · ')}
                </div>
              )}

              {searchResult.groundingSources?.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {t('ai.sourcesTitle')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {searchResult.groundingSources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-sky-700 dark:text-sky-400 hover:underline max-w-sm"
                      >
                        <span className="truncate">{src.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
