import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck2,
  GraduationCap,
  MapPin,
  Search,
  UserPlus,
} from 'lucide-react';
import PublicHeader from '../components/PublicHeader.jsx';
import PublicFooter from '../components/PublicFooter.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { buildBreadcrumbJsonLd, setDynamicSeo } from '../components/RouteSeoManager.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { formatDate, formatMoney } from '../utils/format.js';
import { prefetchRoute } from '../utils/routePrefetch.js';
import { useExpandableList } from '../utils/listOrder.js';
import ViewMoreFooter from '../components/ViewMoreFooter.jsx';

export function PublicJobsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vacancies, setVacancies] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('q') || '');
  const [businessId, setBusinessId] = useState(() => searchParams.get('business_id') || '');
  const [employmentType, setEmploymentType] = useState(() => searchParams.get('employment_type') || '');
  const [workMode, setWorkMode] = useState(() => searchParams.get('work_mode') || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatEmploymentType = (val) =>
    t(`employmentTypes.${val}`, { defaultValue: String(val || 'full_time').replace(/_/g, ' ') });

  const formatWorkMode = (val) =>
    t(`workModes.${val}`, { defaultValue: String(val || 'on_site').replace(/_/g, ' ') });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedSearch !== search) setDebouncedSearch(search);
    }, 240);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    if (businessId) params.set('business_id', businessId);
    if (employmentType) params.set('employment_type', employmentType);
    if (workMode) params.set('work_mode', workMode);
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, businessId, employmentType, workMode, setSearchParams]);

  const loadJobs = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/public/jobs', {
        params: {
          q: debouncedSearch.trim() || undefined,
          business_id: businessId || undefined,
          employment_type: employmentType || undefined,
          work_mode: workMode || undefined,
        },
        signal,
      });
      setVacancies(data.vacancies || []);
      setBusinesses(data.businesses || []);
    } catch (err) {
      if (!err.isCanceled) setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [debouncedSearch, businessId, employmentType, workMode]);

  useEffect(() => {
    const controller = new AbortController();
    loadJobs(controller.signal);
    return () => controller.abort();
  }, [loadJobs]);

  const vacanciesBox = useExpandableList(vacancies, { initialLimit: 6, sortNewest: true });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />

      <main id="main-content" className="flex-1 max-w-7xl mx-auto px-6 py-10 w-full space-y-8 animate-fade-up">
        <nav aria-label="Breadcrumb" className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Link to="/" onMouseEnter={() => prefetchRoute('/')} className="hover:text-slate-900 dark:hover:text-white">
              {t('nav.home')}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="font-semibold text-slate-900 dark:text-white">{t('nav.jobs')}</span>
          </div>
          <Link to="/businesses" onMouseEnter={() => prefetchRoute('/businesses')} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">
            {t('search.quickDirectory')} →
          </Link>
        </nav>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
              {t('jobs.eyebrow')}
            </p>
            <h1 className="text-3xl font-bold text-[#0B192C] dark:text-white">
              {t('jobs.title')}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('jobs.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 w-full lg:w-auto">
            <div className="relative sm:col-span-2 lg:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('jobs.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
            <select
              aria-label={t('jobs.filterBusiness')}
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="">{t('jobs.allBusinesses')}</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                aria-label={t('jobs.filterType')}
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                className="flex-1 px-2.5 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="">{t('jobs.allTypes')}</option>
                <option value="full_time">{t('employmentTypes.full_time')}</option>
                <option value="part_time">{t('employmentTypes.part_time')}</option>
                <option value="contract">{t('employmentTypes.contract')}</option>
                <option value="internship">{t('employmentTypes.internship')}</option>
                <option value="temporary">{t('employmentTypes.temporary')}</option>
              </select>
              <select
                aria-label={t('jobs.filterMode')}
                value={workMode}
                onChange={(e) => setWorkMode(e.target.value)}
                className="flex-1 px-2.5 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="">{t('jobs.allModes')}</option>
                <option value="on_site">{t('workModes.on_site')}</option>
                <option value="hybrid">{t('workModes.hybrid')}</option>
                <option value="remote">{t('workModes.remote')}</option>
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-56 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : vacancies.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <Briefcase className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t('jobs.noMatchTitle')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {t('jobs.noMatchDesc')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {vacanciesBox.visibleItems.map((v) => (
              <article
                key={v.id}
                className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-5 hover:border-sky-500/40 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    {v.business_logo ? (
                      <img
                        src={v.business_logo}
                        alt={v.business_name}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-[#0B192C] dark:text-sky-300 shrink-0">
                        {v.business_name?.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                        <Link to={`/jobs/${v.id}`} className="hover:text-sky-700 dark:hover:text-sky-400">
                          {v.title}
                        </Link>
                      </h2>
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                        {v.business_name}{v.branch_name ? ` · ${v.branch_name}` : ''}
                      </div>
                    </div>
                  </div>

                  {v.summary ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">{v.summary}</p>
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">{v.description}</p>
                  )}

                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{v.location} · {formatWorkMode(v.work_mode)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{formatEmploymentType(v.employment_type)}{v.department ? ` · ${v.department}` : ''}</span>
                    </div>
                    {v.application_deadline && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className={v.is_expired ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}>
                          {v.is_expired
                            ? t('jobs.closedOn', { date: formatDate(v.application_deadline) })
                            : t('jobs.deadlineLabel', { date: formatDate(v.application_deadline) })}
                        </span>
                      </div>
                    )}
                    {Boolean(v.show_salary) && (v.salary_min || v.salary_max) && (
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums pt-0.5">
                        {v.salary_min ? formatMoney(v.salary_min, v.currency_code) : t('jobs.competitive')}
                        {v.salary_max ? ` – ${formatMoney(v.salary_max, v.currency_code)}` : ''}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <Link
                    to={`/jobs/${v.id}`}
                    className="text-xs font-semibold text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    {t('jobs.viewVacancy')}
                  </Link>
                  <Link
                    to={`/jobs/${v.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                  >
                    {v.is_expired ? t('common.details') : t('jobs.applyNow')}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </article>
            ))}
            </div>
            <ViewMoreFooter
              totalCount={vacanciesBox.totalCount}
              visibleCount={vacanciesBox.visibleCount}
              initialLimit={6}
              expanded={vacanciesBox.expanded}
              onToggle={vacanciesBox.toggleExpanded}
              className="rounded-xl border border-slate-200 dark:border-slate-800"
            />
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

export function PublicJobDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [vacancy, setVacancy] = useState(null);
  const [existingApp, setExistingApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatEmploymentType = (val) =>
    t(`employmentTypes.${val}`, { defaultValue: String(val || 'full_time').replace(/_/g, ' ') });

  const formatWorkMode = (val) =>
    t(`workModes.${val}`, { defaultValue: String(val || 'on_site').replace(/_/g, ' ') });

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get(`/public/jobs/${id}`)
      .then(({ data }) => {
        setVacancy(data.vacancy || null);
        setExistingApp(data.existing_application || null);
        if (data.vacancy?.title) {
          const v = data.vacancy;
          const origin = window.location.origin;
          const empMap = {
            full_time: 'FULL_TIME',
            part_time: 'PART_TIME',
            contract: 'CONTRACTOR',
            internship: 'INTERN',
            temporary: 'TEMPORARY',
          };
          const bizLogo = v.business_logo
            ? (v.business_logo.startsWith('http') ? v.business_logo : `${origin}${v.business_logo}`)
            : `${origin}/og-share.jpg`;
          const jobNode = {
            '@type': 'JobPosting',
            title: v.title,
            description: v.description || v.summary || v.title,
            datePosted: String(v.published_at || v.created_at || new Date().toISOString()).slice(0, 10),
            validThrough: v.application_deadline ? String(v.application_deadline).slice(0, 10) : undefined,
            employmentType: empMap[v.employment_type] || 'FULL_TIME',
            hiringOrganization: {
              '@type': 'Organization',
              name: v.business_name,
              sameAs: `${origin}/businesses/${v.business_slug}`,
              logo: bizLogo,
            },
            ...(v.work_mode === 'remote' ? { jobLocationType: 'TELECOMMUTE' } : {}),
            jobLocation: {
              '@type': 'Place',
              address: {
                '@type': 'PostalAddress',
                addressLocality: v.location || v.business_district || undefined,
                addressRegion: v.business_province || undefined,
                addressCountry: v.business_country || 'RW',
              },
            },
            ...(v.show_salary && (v.salary_min || v.salary_max)
              ? {
                  baseSalary: {
                    '@type': 'MonetaryAmount',
                    currency: v.currency_code || 'RWF',
                    value: {
                      '@type': 'QuantitativeValue',
                      minValue: v.salary_min || undefined,
                      maxValue: v.salary_max || undefined,
                      unitText: 'MONTH',
                    },
                  },
                }
              : {}),
          };
          const breadcrumb = buildBreadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Jobs', path: '/jobs' },
            { name: v.title, path: `/jobs/${v.id}` },
          ]);

          setDynamicSeo({
            title: `${v.title} — ${v.business_name} | BizTrade Africa`.slice(0, 60),
            description: (
              v.summary ||
              `Apply for ${v.title} at ${v.business_name} in ${v.location}. Submit your CV and diploma online on BizTrade Africa.`
            ).slice(0, 160),
            image: bizLogo,
            imageAlt: `${v.title} at ${v.business_name}`,
            structuredData: {
              '@context': 'https://schema.org',
              '@graph': [jobNode, ...(breadcrumb ? [breadcrumb] : [])],
            },
          });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, user?.id]);

  const applyTarget = vacancy ? `/jobs/${vacancy.id}/apply` : '/jobs';

  const handleApplyClick = () => {
    if (!vacancy) return;
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(applyTarget)}`);
      return;
    }
    navigate(applyTarget);
  };

  const isBlockedDuplicate =
    existingApp &&
    existingApp.status !== 'draft' &&
    (!vacancy?.allow_reapplication ||
      ['submitted', 'under_review', 'shortlisted', 'interview_scheduled', 'interview_completed', 'accepted'].includes(
        existingApp.status
      ));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />

      <main id="main-content" className="flex-1 max-w-6xl mx-auto px-6 py-10 w-full space-y-6 animate-fade-up">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link to="/" onMouseEnter={() => prefetchRoute('/')} className="hover:text-slate-900 dark:hover:text-white">
              {t('nav.home')}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <Link to="/jobs" onMouseEnter={() => prefetchRoute('/jobs')} className="hover:text-slate-900 dark:hover:text-white">
              {t('nav.jobs')}
            </Link>
            {vacancy?.title && (
              <>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold text-slate-900 dark:text-white truncate">{vacancy.title}</span>
              </>
            )}
          </div>
          <Link to="/jobs" className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white shrink-0">
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('jobs.backToJobs')}
          </Link>
        </nav>

        {error && (
          <div className="p-4 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-72 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
        ) : !vacancy ? null : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {vacancy.business_logo ? (
                      <img
                        src={vacancy.business_logo}
                        alt={vacancy.business_name}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-base font-bold text-[#0B192C] dark:text-sky-300 shrink-0">
                        {vacancy.business_name?.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="space-y-1">
                      <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">{vacancy.title}</h1>
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                        <Link to={`/businesses/${vacancy.business_slug}`} className="text-sky-700 dark:text-sky-400 hover:underline">
                          {vacancy.business_name}
                        </Link>
                        {vacancy.branch_name ? ` · ${vacancy.branch_name}` : ''}
                        {vacancy.department ? ` · ${vacancy.department}` : ''}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={vacancy.is_expired ? 'closed' : vacancy.status} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">{t('jobs.location')}</div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{vacancy.location}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">{t('jobs.employment')}</div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                      {formatEmploymentType(vacancy.employment_type)} · {formatWorkMode(vacancy.work_mode)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">{t('jobs.openings')}</div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                      {t('jobs.positionsCount', { count: vacancy.positions_count || 1 })}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">{t('jobs.deadlineField')}</div>
                    <div className="font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                      {vacancy.application_deadline ? formatDate(vacancy.application_deadline) : t('jobs.openUntilFilled')}
                    </div>
                  </div>
                </div>

                {Boolean(vacancy.show_salary) && (vacancy.salary_min || vacancy.salary_max) && (
                  <div className="p-3.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                    <span className="font-semibold">{t('jobs.indicativeCompensation')}</span>
                    <span className="font-bold tabular-nums">
                      {vacancy.salary_min ? formatMoney(vacancy.salary_min, vacancy.currency_code) : t('jobs.competitive')}
                      {vacancy.salary_max ? ` – ${formatMoney(vacancy.salary_max, vacancy.currency_code)}` : ''}
                    </span>
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('jobs.roleDescription')}</h2>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    {vacancy.description}
                  </p>
                </div>

                {vacancy.responsibilities && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('jobs.keyResponsibilities')}</h2>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                      {vacancy.responsibilities}
                    </p>
                  </div>
                )}

                {vacancy.requirements && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('jobs.qualifications')}</h2>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                      {vacancy.requirements}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <aside className="lg:col-span-4 space-y-5">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                <h2 className="text-sm font-bold text-[#0B192C] dark:text-white">{t('jobs.applicationChecklist')}</h2>
                <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{t('jobs.checklistVerifiedAccount')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <GraduationCap className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      {t('jobs.checklistEducation')}
                      {vacancy.required_education_level ? ` ${t('jobs.checklistTarget', { level: vacancy.required_education_level })}` : ''}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <FileCheck2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <span>{t('jobs.checklistCv')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      {Number(vacancy.min_experience_years) > 0
                        ? t('jobs.checklistExpRecommended', { years: vacancy.min_experience_years })
                        : t('jobs.checklistExpFresh')}
                    </span>
                  </li>
                  {vacancy.required_document_types?.length > 0 && (
                    <li className="pt-1">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">{t('jobs.requiredSupportingDocs')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {vacancy.required_document_types.map((docType) => (
                          <span
                            key={docType}
                            className="px-2 py-0.5 text-[11px] rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          >
                            {docType}
                          </span>
                        ))}
                      </div>
                    </li>
                  )}
                </ul>

                {user?.is_platform_admin ? (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                    {t('jobs.superAdminBlocked')}
                  </div>
                ) : vacancy.is_expired ? (
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
                    {t('jobs.deadlinePassed')}
                  </div>
                ) : isBlockedDuplicate ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-xs text-sky-900 dark:text-sky-200">
                      {t('jobs.alreadySubmitted', { ref: existingApp.reference_number })}
                    </div>
                    <Link
                      to={`/customer?tab=applications&applicationId=${existingApp.id}`}
                      className="block text-center w-full py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                    >
                      {t('jobs.trackApplicationStatus')}
                    </Link>
                  </div>
                ) : existingApp?.status === 'draft' ? (
                  <button
                    type="button"
                    onClick={handleApplyClick}
                    className="w-full py-2.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-500"
                  >
                    {t('jobs.resumeDraft')}
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={handleApplyClick}
                      className={`${!user ? 'btn-auth-login-live ' : ''}w-full py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500`}
                    >
                      {user ? t('jobs.applyNow') : t('jobs.signInApply')}
                    </button>
                    {!user && (
                      <Link
                        to={`/register?redirect=${encodeURIComponent(applyTarget)}`}
                        className="inline-flex items-center justify-center gap-1.5 w-full py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {t('jobs.newCandidateCreate')}
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 font-bold text-[#0B192C] dark:text-white text-sm">
                  <Building2 className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                  <span>{t('jobs.aboutBusiness', { name: vacancy.business_name })}</span>
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  {vacancy.business_category} · {vacancy.business_district}, {vacancy.business_country}
                </div>
                {vacancy.business_description && (
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                    {vacancy.business_description}
                  </p>
                )}
                <Link
                  to={`/businesses/${vacancy.business_slug}`}
                  className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400 font-semibold hover:underline pt-1"
                >
                  {t('jobs.viewBusinessProfile')}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </aside>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
