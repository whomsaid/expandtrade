import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  Calendar,
  Download,
  Eye,
  FileText,
  Lock,
  Plus,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PrivateDocumentPreviewModal, { downloadPrivateDocument } from '../../components/PrivateDocumentPreviewModal.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../services/api.js';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format.js';
import { useExpandableList } from '../../utils/listOrder.js';
import ViewMoreFooter from '../../components/ViewMoreFooter.jsx';

const EDUCATION_LEVELS = [
  'Primary',
  'Secondary (O-Level)',
  'Secondary (A-Level)',
  'TVET / Vocational',
  'Certificate',
  'Diploma',
  "Bachelor's Degree",
  'Postgraduate Diploma',
  "Master's Degree",
  'PhD',
];

const DOCUMENT_PRESET_TYPES = [
  'Academic Certificate',
  'Diploma',
  'Degree Certificate',
  'Transcript',
  'Professional License',
  'National ID',
  'Recommendation Letter',
];

const EMPTY_VACANCY = {
  id: null,
  title: '',
  branch_id: '',
  department: '',
  employment_type: 'full_time',
  work_mode: 'on_site',
  location: '',
  salary_min: '',
  salary_max: '',
  show_salary: false,
  summary: '',
  description: '',
  responsibilities: '',
  requirements: '',
  required_education_level: '',
  min_experience_years: 0,
  required_document_types: [],
  custom_questions: [],
  allow_reapplication: false,
  positions_count: 1,
  application_deadline: '',
  publish_now: true,
};

export default function RecruitmentPage() {
  const { t } = useTranslation();
  const { workspace, activeBusinessId, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = hasPermission('recruitment.manage');

  const [subTab, setSubTab] = useState('applications');
  const [stats, setStats] = useState({
    total: 0,
    submitted: 0,
    under_review: 0,
    shortlisted: 0,
    interview_scheduled: 0,
    interview_completed: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
  });
  const [vacancies, setVacancies] = useState([]);
  const [applications, setApplications] = useState([]);
  const [filters, setFilters] = useState({
    q: '',
    vacancy_id: '',
    status: '',
    education_level: '',
    has_work_experience: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [notice, setNotice] = useState('');

  // Detail modal states
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState({ status: 'under_review', note: '' });
  const [interviewForm, setInterviewForm] = useState({
    interview_date: '',
    interview_time: '',
    interview_mode: 'In-person',
    location_or_link: '',
    interviewer_name: '',
    instructions: '',
  });
  const [noteInput, setNoteInput] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);

  // Vacancy modal states
  const [vacancyModalOpen, setVacancyModalOpen] = useState(false);
  const [vacancyForm, setVacancyForm] = useState(EMPTY_VACANCY);
  const [newQuestionLabel, setNewQuestionLabel] = useState('');
  const [newQuestionReq, setNewQuestionReq] = useState(true);
  const [savingVacancy, setSavingVacancy] = useState(false);

  const applicationsBox = useExpandableList(applications, { initialLimit: 6, sortNewest: true });
  const vacanciesBox = useExpandableList(vacancies, { initialLimit: 6, sortNewest: true });
  const detailDocsBox = useExpandableList(selectedDetail?.documents || [], { initialLimit: 5, sortNewest: true });
  const detailEduBox = useExpandableList(selectedDetail?.education || [], { initialLimit: 4, sortNewest: true });
  const detailExpBox = useExpandableList(selectedDetail?.experiences || [], { initialLimit: 4, sortNewest: true });
  const detailInterviewsBox = useExpandableList(selectedDetail?.interviews || [], { initialLimit: 4, sortNewest: true });
  const detailNotesBox = useExpandableList(selectedDetail?.notes || [], { initialLimit: 5, sortNewest: true });
  const detailHistoryBox = useExpandableList(selectedDetail?.status_history || [], { initialLimit: 6, sortNewest: true });

  const loadOverview = useCallback(async () => {
    if (!activeBusinessId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/recruitment/overview', {
        params: {
          q: filters.q.trim() || undefined,
          vacancy_id: filters.vacancy_id || undefined,
          status: filters.status || undefined,
          education_level: filters.education_level || undefined,
          has_work_experience: filters.has_work_experience || undefined,
        },
      });
      setStats(data.stats || {});
      setVacancies(data.vacancies || []);
      setApplications(data.applications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId, filters]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const openApplicationDetail = useCallback(async (appId) => {
    setLoadingDetail(true);
    setError('');
    setModalError('');
    try {
      const { data } = await api.get(`/recruitment/applications/${appId}`);
      setSelectedDetail(data);
      setStatusUpdate({ status: data.application.status, note: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    const appIdParam = searchParams.get('applicationId');
    if (appIdParam && activeBusinessId) {
      openApplicationDetail(Number(appIdParam));
    }
  }, [searchParams, activeBusinessId, openApplicationDetail]);

  const closeDetail = () => {
    setSelectedDetail(null);
    if (searchParams.has('applicationId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('applicationId');
      setSearchParams(next, { replace: true });
    }
  };

  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    if (!selectedDetail?.application?.id || savingAction) return;
    setModalError('');
    setNotice('');
    setSavingAction(true);
    try {
      const { data } = await api.patch(
        `/recruitment/applications/${selectedDetail.application.id}/status`,
        statusUpdate
      );
      setNotice(data.message);
      await openApplicationDetail(selectedDetail.application.id);
      await loadOverview();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSavingAction(false);
    }
  };

  const handleScheduleInterview = async (e) => {
    e.preventDefault();
    if (!selectedDetail?.application?.id || savingAction) return;
    setModalError('');
    setNotice('');
    setSavingAction(true);
    try {
      const { data } = await api.post(
        `/recruitment/applications/${selectedDetail.application.id}/interviews`,
        interviewForm
      );
      setNotice(data.message);
      setInterviewForm({
        interview_date: '',
        interview_time: '',
        interview_mode: 'In-person',
        location_or_link: '',
        interviewer_name: '',
        instructions: '',
      });
      await openApplicationDetail(selectedDetail.application.id);
      await loadOverview();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSavingAction(false);
    }
  };

  const handleUpdateInterview = async (interviewId, payload) => {
    if (savingAction) return;
    setModalError('');
    setNotice('');
    setSavingAction(true);
    try {
      const { data } = await api.patch(`/recruitment/interviews/${interviewId}`, payload);
      setNotice(data.message);
      if (selectedDetail?.application?.id) {
        await openApplicationDetail(selectedDetail.application.id);
      }
      await loadOverview();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSavingAction(false);
    }
  };

  const handleAddInternalNote = async (e) => {
    e.preventDefault();
    if (!selectedDetail?.application?.id || !noteInput.trim() || savingAction) return;
    setModalError('');
    setSavingAction(true);
    try {
      const { data } = await api.post(
        `/recruitment/applications/${selectedDetail.application.id}/notes`,
        { note: noteInput }
      );
      setNoteInput('');
      setNotice(data.message);
      await openApplicationDetail(selectedDetail.application.id);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSavingAction(false);
    }
  };

  const openCreateVacancy = () => {
    setModalError('');
    setVacancyForm({
      ...EMPTY_VACANCY,
      location: workspace?.business?.district ? `${workspace.business.district}, ${workspace.business.country || 'Rwanda'}` : '',
    });
    setVacancyModalOpen(true);
  };

  const openEditVacancy = (v) => {
    setModalError('');
    setVacancyForm({
      id: v.id,
      title: v.title || '',
      branch_id: v.branch_id ? String(v.branch_id) : '',
      department: v.department || '',
      employment_type: v.employment_type || 'full_time',
      work_mode: v.work_mode || 'on_site',
      location: v.location || '',
      salary_min: v.salary_min ?? '',
      salary_max: v.salary_max ?? '',
      show_salary: Boolean(v.show_salary),
      summary: v.summary || '',
      description: v.description || '',
      responsibilities: v.responsibilities || '',
      requirements: v.requirements || '',
      required_education_level: v.required_education_level || '',
      min_experience_years: v.min_experience_years || 0,
      required_document_types: v.required_document_types || [],
      custom_questions: v.custom_questions || [],
      allow_reapplication: Boolean(v.allow_reapplication),
      positions_count: v.positions_count || 1,
      application_deadline: v.application_deadline || '',
      publish_now: v.status === 'published',
    });
    setVacancyModalOpen(true);
  };

  const handleSaveVacancy = async (e) => {
    e.preventDefault();
    if (savingVacancy) return;
    setSavingVacancy(true);
    setModalError('');
    setNotice('');
    try {
      const payload = {
        ...vacancyForm,
        branch_id: vacancyForm.branch_id ? Number(vacancyForm.branch_id) : null,
        salary_min: vacancyForm.salary_min === '' ? null : Number(vacancyForm.salary_min),
        salary_max: vacancyForm.salary_max === '' ? null : Number(vacancyForm.salary_max),
        min_experience_years: Number(vacancyForm.min_experience_years || 0),
        positions_count: Number(vacancyForm.positions_count || 1),
        application_deadline: vacancyForm.application_deadline || null,
      };
      if (vacancyForm.id) {
        const { data } = await api.put(`/recruitment/vacancies/${vacancyForm.id}`, payload);
        setNotice(data.message);
      } else {
        const { data } = await api.post('/recruitment/vacancies', payload);
        setNotice(data.message);
      }
      setVacancyModalOpen(false);
      await loadOverview();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSavingVacancy(false);
    }
  };

  const handleVacancyStatus = async (vacancyId, nextStatus) => {
    setError('');
    setNotice('');
    try {
      const { data } = await api.patch(`/recruitment/vacancies/${vacancyId}/status`, { status: nextStatus });
      setNotice(data.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleDocRequirement = (docType) => {
    setVacancyForm((prev) => {
      const exists = prev.required_document_types.includes(docType);
      return {
        ...prev,
        required_document_types: exists
          ? prev.required_document_types.filter((d) => d !== docType)
          : [...prev.required_document_types, docType],
      };
    });
  };

  const addCustomQuestion = () => {
    if (!newQuestionLabel.trim()) return;
    setVacancyForm((prev) => ({
      ...prev,
      custom_questions: [
        ...prev.custom_questions,
        {
          key: `q_${Date.now()}`,
          label: newQuestionLabel.trim(),
          required: newQuestionReq,
        },
      ],
    }));
    setNewQuestionLabel('');
    setNewQuestionReq(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('recruitment.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('recruitment.subtitle')}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            data-shortcut-new="true"
            onClick={openCreateVacancy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t('recruitment.postNewVacancy')}
          </button>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
      {notice && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}

      {/* Summary Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        {[
          [t('recruitment.statTotal'), stats.total || 0],
          [t('recruitment.statSubmitted'), stats.submitted || 0],
          [t('recruitment.statUnderReview'), stats.under_review || 0],
          [t('recruitment.statShortlisted'), stats.shortlisted || 0],
          [t('recruitment.statInterviews'), stats.interview_scheduled || 0],
          [t('recruitment.statAccepted'), stats.accepted || 0],
          [t('recruitment.statRejected'), stats.rejected || 0],
        ].map(([label, val]) => (
          <div key={label} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="text-slate-500 dark:text-slate-400">{label}</div>
            <div className="text-lg font-bold text-[#0B192C] dark:text-white mt-0.5 tabular-nums">{val}</div>
          </div>
        ))}
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setSubTab('applications')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border ${
            subTab === 'applications'
              ? 'bg-[#0B192C] dark:bg-sky-600 text-white border-[#0B192C] dark:border-sky-600'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          {t('recruitment.tabApplications', { count: applications.length })}
        </button>
        <button
          type="button"
          onClick={() => setSubTab('vacancies')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border ${
            subTab === 'vacancies'
              ? 'bg-[#0B192C] dark:bg-sky-600 text-white border-[#0B192C] dark:border-sky-600'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          {t('recruitment.tabVacancies', { count: vacancies.length })}
        </button>
      </div>

      {/* TAB 1: APPLICATIONS */}
      {subTab === 'applications' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                placeholder={t('recruitment.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <select
              value={filters.vacancy_id}
              onChange={(e) => setFilters({ ...filters, vacancy_id: e.target.value })}
              className="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="">{t('recruitment.allVacancies')}</option>
              {vacancies.map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="">{t('recruitment.allStatuses')}</option>
              <option value="submitted">{t('status.submitted')}</option>
              <option value="under_review">{t('status.under_review')}</option>
              <option value="shortlisted">{t('status.shortlisted')}</option>
              <option value="interview_scheduled">{t('status.interview_scheduled')}</option>
              <option value="interview_completed">{t('status.interview_completed')}</option>
              <option value="accepted">{t('status.accepted')}</option>
              <option value="rejected">{t('status.rejected')}</option>
              <option value="withdrawn">{t('status.withdrawn')}</option>
            </select>
            <select
              value={filters.education_level}
              onChange={(e) => setFilters({ ...filters, education_level: e.target.value })}
              className="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="">{t('recruitment.allEduLevels')}</option>
              {EDUCATION_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl}</option>
              ))}
            </select>
            <select
              value={filters.has_work_experience}
              onChange={(e) => setFilters({ ...filters, has_work_experience: e.target.value })}
              className="px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="">{t('recruitment.expAll')}</option>
              <option value="1">{t('recruitment.expWith')}</option>
              <option value="0">{t('recruitment.expWithout')}</option>
            </select>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="py-3 px-4 font-semibold">{t('recruitment.colRef')}</th>
                    <th className="py-3 px-4 font-semibold">{t('recruitment.colApplicant')}</th>
                    <th className="py-3 px-4 font-semibold">{t('recruitment.colVacancy')}</th>
                    <th className="py-3 px-4 font-semibold">{t('recruitment.colEducation')}</th>
                    <th className="py-3 px-4 font-semibold">{t('recruitment.colExperience')}</th>
                    <th className="py-3 px-4 font-semibold">{t('recruitment.colStatus')}</th>
                    <th className="py-3 px-4 font-semibold">{t('recruitment.colSubmitted')}</th>
                    <th className="py-3 px-4 font-semibold text-right">{t('recruitment.colAction')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">{t('recruitment.loadingApps')}</td>
                    </tr>
                  ) : applications.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                        {t('recruitment.emptyApps')}
                      </td>
                    </tr>
                  ) : (
                    applicationsBox.visibleItems.map((app) => (
                      <tr key={app.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {app.reference_number || `#${app.id}`}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar src={app.profile_photo_url} name={app.full_name} size="sm" />
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">{app.full_name}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">{app.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{app.vacancy_title}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{app.highest_education || t('recruitment.eduRecorded')}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {app.has_work_experience ? t('recruitment.expYears', { count: app.years_of_experience || 0 }) : t('recruitment.expNone')}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={app.status} />
                          {app.next_interview_date && (
                            <div className="text-[10px] text-sky-700 dark:text-sky-400 mt-1 tabular-nums">
                              {app.next_interview_date} {app.next_interview_time}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                          {formatDateTime(app.submitted_at || app.created_at)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openApplicationDetail(app.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {t('recruitment.inspectBtn')}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <ViewMoreFooter
              totalCount={applicationsBox.totalCount}
              visibleCount={applicationsBox.visibleCount}
              initialLimit={6}
              expanded={applicationsBox.expanded}
              onToggle={applicationsBox.toggleExpanded}
            />
          </div>
        </div>
      )}

      {/* TAB 2: VACANCIES */}
      {subTab === 'vacancies' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vacancies.length === 0 ? (
              <div className="md:col-span-2 bg-white dark:bg-slate-900 p-10 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
                {t('recruitment.emptyVacancies')}
              </div>
            ) : (
              vacanciesBox.visibleItems.map((v) => (
                <div key={v.id} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{v.title}</h3>
                        <div className="text-slate-500 dark:text-slate-400">
                          {v.department || t('recruitment.generalDept')} · {v.location} {v.branch_name ? `(${v.branch_name})` : ''}
                        </div>
                      </div>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 line-clamp-2">{v.summary || v.description}</p>
                    <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>{t('recruitment.applicantsCount')} <strong className="text-slate-900 dark:text-white">{v.applicant_count || 0}</strong></span>
                      <span>{t('recruitment.positionsCount')} <strong className="text-slate-900 dark:text-white">{v.positions_count || 1}</strong></span>
                      <span>{t('recruitment.deadlineLabel')} <strong className="text-slate-900 dark:text-white">{v.application_deadline ? formatDate(v.application_deadline) : t('recruitment.openStatus')}</strong></span>
                      <span>{t('recruitment.customQsCount')} <strong className="text-slate-900 dark:text-white">{v.custom_questions?.length || 0}</strong></span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openEditVacancy(v)}
                        className="px-3 py-1.5 font-semibold border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        {t('recruitment.editVacancyQs')}
                      </button>
                      <div className="flex items-center gap-1.5">
                        {v.status !== 'published' && (
                          <button
                            type="button"
                            onClick={() => handleVacancyStatus(v.id, 'published')}
                            className="px-2.5 py-1.5 font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-500"
                          >
                            {t('recruitment.publishBtn')}
                          </button>
                        )}
                        {v.status === 'published' && (
                          <button
                            type="button"
                            onClick={() => handleVacancyStatus(v.id, 'closed')}
                            className="px-2.5 py-1.5 font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-lg"
                          >
                            {t('recruitment.closeBtn')}
                          </button>
                        )}
                        {v.status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => handleVacancyStatus(v.id, 'archived')}
                            className="px-2.5 py-1.5 font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg"
                          >
                            {t('recruitment.archiveBtn')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
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

      {/* APPLICATION DETAIL MODAL */}
      {(loadingDetail || selectedDetail) && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-fade-up">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              {selectedDetail ? (
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar src={selectedDetail.application.profile_photo_url} name={selectedDetail.application.full_name} size="md" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-[#0B192C] dark:text-white truncate">
                        {selectedDetail.application.full_name}
                      </h2>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {selectedDetail.application.reference_number}
                      </span>
                      <StatusBadge status={selectedDetail.application.status} />
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {selectedDetail.application.vacancy_title} · {selectedDetail.application.email} · {selectedDetail.application.phone}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm font-bold">{t('recruitment.loadingAppProfile')}</div>
              )}
              <button
                type="button"
                onClick={closeDetail}
                aria-label={t('recruitment.closeModalAria')}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingDetail ? (
              <div className="p-10 text-center text-xs text-slate-500">{t('recruitment.loadingProfileDetail')}</div>
            ) : selectedDetail && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
                {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left 7 cols: Profile, Education, Experience, Skills, Answers, Docs */}
                  <div className="lg:col-span-7 space-y-5">
                    {/* Personal Summary */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <h3 className="font-bold text-slate-900 dark:text-white">{t('recruitment.personalAvailTitle')}</h3>
                      <div className="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                        <div>{t('recruitment.locLabel')} <strong>{selectedDetail.application.district || selectedDetail.application.country || 'N/A'}</strong></div>
                        <div>{t('recruitment.natLabel')} <strong>{selectedDetail.application.nationality || 'N/A'}</strong></div>
                        <div>{t('recruitment.availLabel')} <strong>{selectedDetail.application.availability || 'N/A'}</strong></div>
                        <div>{t('recruitment.expSalaryLabel')} <strong>{selectedDetail.application.expected_salary ? formatMoney(selectedDetail.application.expected_salary, 'RWF') : t('recruitment.notSpecified')}</strong></div>
                      </div>
                      {selectedDetail.application.residential_address && (
                        <div className="text-slate-500 dark:text-slate-400">{t('recruitment.addrLabel', { address: selectedDetail.application.residential_address })}</div>
                      )}
                    </div>

                    {/* Documents (CV + Certificates) */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                      <h3 className="font-bold text-slate-900 dark:text-white">{t('recruitment.docsTitle', { count: selectedDetail.documents.length })}</h3>
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {detailDocsBox.visibleItems.map((doc) => (
                          <div key={doc.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-sky-600" />
                                <span>{doc.document_name}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {doc.document_type} · {doc.original_filename}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(doc)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100"
                              >
                                <Eye className="w-3 h-3" />
                                {t('recruitment.previewBtn')}
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadPrivateDocument(doc.download_url, doc.original_filename)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100"
                              >
                                <Download className="w-3 h-3" />
                                {t('recruitment.downloadBtn')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <ViewMoreFooter
                        totalCount={detailDocsBox.totalCount}
                        visibleCount={detailDocsBox.visibleCount}
                        initialLimit={5}
                        expanded={detailDocsBox.expanded}
                        onToggle={detailDocsBox.toggleExpanded}
                        className="-mx-4 -mb-4 rounded-b-xl"
                      />
                    </div>

                    {/* Education */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <h3 className="font-bold text-slate-900 dark:text-white">{t('recruitment.eduBgTitle')}</h3>
                      {detailEduBox.visibleItems.map((edu) => (
                        <div key={edu.id} className="py-1.5 border-b last:border-0 border-slate-200 dark:border-slate-800">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {edu.education_level} — {edu.institution_name}
                          </div>
                          <div className="text-slate-600 dark:text-slate-300">
                            {edu.qualification_obtained || edu.field_of_study || t('recruitment.qualificationFallback')} · {edu.education_status}
                            {edu.graduation_year ? ` (${edu.start_year || '?'}–${edu.graduation_year})` : ''}
                          </div>
                        </div>
                      ))}
                      <ViewMoreFooter
                        totalCount={detailEduBox.totalCount}
                        visibleCount={detailEduBox.visibleCount}
                        initialLimit={4}
                        expanded={detailEduBox.expanded}
                        onToggle={detailEduBox.toggleExpanded}
                        className="-mx-4 -mb-4 rounded-b-xl"
                      />
                    </div>

                    {/* Work Experience */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <h3 className="font-bold text-slate-900 dark:text-white">{t('recruitment.workExpTitle')}</h3>
                      {!selectedDetail.application.has_work_experience ? (
                        <div className="text-slate-600 dark:text-slate-300 italic">{t('recruitment.noExpIndicated')}</div>
                      ) : (
                        <>
                          {detailExpBox.visibleItems.map((ex) => (
                            <div key={ex.id} className="py-1.5 border-b last:border-0 border-slate-200 dark:border-slate-800 space-y-0.5">
                              <div className="font-semibold text-slate-900 dark:text-white">
                                {t('recruitment.atCompany', { title: ex.job_title, company: ex.company_name })}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {ex.start_date} – {ex.is_current ? t('recruitment.present') : ex.end_date || 'N/A'} {ex.work_location ? `· ${ex.work_location}` : ''}
                              </div>
                              {ex.responsibilities && <div className="text-slate-600 dark:text-slate-300">{ex.responsibilities}</div>}
                            </div>
                          ))}
                          <ViewMoreFooter
                            totalCount={detailExpBox.totalCount}
                            visibleCount={detailExpBox.visibleCount}
                            initialLimit={4}
                            expanded={detailExpBox.expanded}
                            onToggle={detailExpBox.toggleExpanded}
                            className="-mx-4 -mb-4 rounded-b-xl"
                          />
                        </>
                      )}
                    </div>

                    {/* Skills & Job Questions */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <h3 className="font-bold text-slate-900 dark:text-white">{t('recruitment.skillsAnswersTitle')}</h3>
                      {selectedDetail.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedDetail.skills.map((s) => (
                            <span key={s.id} className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                              {s.skill_name} ({s.proficiency_level || s.skill_category})
                            </span>
                          ))}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{t('recruitment.whyWantQ')}</div>
                        <p className="text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-line">{selectedDetail.application.why_want_position}</p>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{t('recruitment.whySelectQ')}</div>
                        <p className="text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-line">{selectedDetail.application.why_select_you}</p>
                      </div>
                      {selectedDetail.application.cover_letter && (
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{t('recruitment.coverLetterLabel')}</div>
                          <p className="text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-line">{selectedDetail.application.cover_letter}</p>
                        </div>
                      )}
                      {selectedDetail.answers.map((ans) => (
                        <div key={ans.id}>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{ans.question_label}</div>
                          <p className="text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-line">{ans.answer_text || '—'}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right 5 cols: Status Update, Interviews, Private HR Notes, History */}
                  <div className="lg:col-span-5 space-y-5">
                    {canManage && selectedDetail.application.status !== 'withdrawn' && (
                      <form onSubmit={handleStatusUpdate} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                        <h3 className="font-bold text-slate-900 dark:text-white">{t('recruitment.updateStatusTitle')}</h3>
                        <select
                          value={statusUpdate.status}
                          onChange={(e) => setStatusUpdate({ ...statusUpdate, status: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                        >
                          <option value="submitted">{t('status.submitted')}</option>
                          <option value="under_review">{t('status.under_review')}</option>
                          <option value="shortlisted">{t('status.shortlisted')}</option>
                          <option value="interview_scheduled">{t('status.interview_scheduled')}</option>
                          <option value="interview_completed">{t('status.interview_completed')}</option>
                          <option value="accepted">{t('recruitment.statusAcceptedHired')}</option>
                          <option value="rejected">{t('status.rejected')}</option>
                        </select>
                        <input
                          value={statusUpdate.note}
                          onChange={(e) => setStatusUpdate({ ...statusUpdate, note: e.target.value })}
                          placeholder={t('recruitment.applicantNotePlaceholder')}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                        <button type="submit" disabled={savingAction} className="w-full py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50">
                          {savingAction ? t('common.saving') : t('recruitment.saveStatusNotify')}
                        </button>
                      </form>
                    )}

                    {/* Interviews */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                        <Calendar className="w-4 h-4 text-sky-600" />
                        <span>{t('recruitment.interviewsTitle', { count: selectedDetail.interviews.length })}</span>
                      </div>

                      {detailInterviewsBox.visibleItems.map((iv) => (
                        <div key={iv.id} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                              {iv.interview_date} {t('recruitment.atTime')} {iv.interview_time}
                            </span>
                            <StatusBadge status={iv.status === 'scheduled' ? 'interview_scheduled' : iv.status} />
                          </div>
                          <div className="text-slate-600 dark:text-slate-300">
                            {iv.interview_mode}{iv.location_or_link ? ` · ${iv.location_or_link}` : ''}
                          </div>
                          {iv.interviewer_name && <div className="text-[11px] text-slate-500">{t('recruitment.interviewerPrefix', { name: iv.interviewer_name })}</div>}
                          {canManage && iv.status === 'scheduled' && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateInterview(iv.id, { status: 'completed', outcome: 'passed' })}
                                className="px-2 py-1 text-[11px] font-semibold text-white bg-emerald-600 rounded"
                              >
                                {t('recruitment.completePass')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateInterview(iv.id, { status: 'completed', outcome: 'hold' })}
                                className="px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-100 rounded"
                              >
                                {t('recruitment.completeHold')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateInterview(iv.id, { status: 'cancelled' })}
                                className="px-2 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded"
                              >
                                {t('common.cancel')}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      <ViewMoreFooter
                        totalCount={detailInterviewsBox.totalCount}
                        visibleCount={detailInterviewsBox.visibleCount}
                        initialLimit={4}
                        expanded={detailInterviewsBox.expanded}
                        onToggle={detailInterviewsBox.toggleExpanded}
                        className="-mx-4 rounded-b-lg"
                      />

                      {canManage && selectedDetail.application.status !== 'withdrawn' && (
                        <form onSubmit={handleScheduleInterview} className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{t('recruitment.scheduleNewTitle')}</div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              required
                              type="date"
                              value={interviewForm.interview_date}
                              onChange={(e) => setInterviewForm({ ...interviewForm, interview_date: e.target.value })}
                              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                            <input
                              required
                              type="time"
                              value={interviewForm.interview_time}
                              onChange={(e) => setInterviewForm({ ...interviewForm, interview_time: e.target.value })}
                              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                          <select
                            value={interviewForm.interview_mode}
                            onChange={(e) => setInterviewForm({ ...interviewForm, interview_mode: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            <option value="In-person">{t('recruitment.modeInPerson')}</option>
                            <option value="Phone">{t('recruitment.modePhone')}</option>
                            <option value="Online Video">{t('recruitment.modeOnline')}</option>
                          </select>
                          <input
                            value={interviewForm.location_or_link}
                            onChange={(e) => setInterviewForm({ ...interviewForm, location_or_link: e.target.value })}
                            placeholder={t('recruitment.locOrLinkPlaceholder')}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                          <input
                            value={interviewForm.interviewer_name}
                            onChange={(e) => setInterviewForm({ ...interviewForm, interviewer_name: e.target.value })}
                            placeholder={t('recruitment.interviewerPlaceholder')}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                          <button type="submit" disabled={savingAction} className="w-full py-1.5 font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-500 disabled:opacity-50">
                            {savingAction ? t('common.saving') : t('recruitment.scheduleNotifyBtn')}
                          </button>
                        </form>
                      )}
                    </div>

                    {/* Private Staff-Only Internal Notes */}
                    <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 space-y-2.5">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
                        <Lock className="w-3.5 h-3.5" />
                        <span>{t('recruitment.privateNotesTitle')}</span>
                      </div>
                      {canManage && (
                        <form onSubmit={handleAddInternalNote} className="flex gap-2">
                          <input
                            value={noteInput}
                            onChange={(e) => setNoteInput(e.target.value)}
                            placeholder={t('recruitment.addNotePlaceholder')}
                            className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg"
                          />
                          <button type="submit" disabled={savingAction} className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg disabled:opacity-50">
                            {savingAction ? t('common.saving') : t('recruitment.addBtn')}
                          </button>
                        </form>
                      )}
                      <div className="space-y-1.5">
                        {selectedDetail.notes.length === 0 ? (
                          <div className="text-[11px] text-amber-800/70 dark:text-amber-300/70">{t('recruitment.noNotes')}</div>
                        ) : (
                          detailNotesBox.visibleItems.map((n) => (
                            <div key={n.id} className="p-2 rounded bg-white dark:bg-slate-900 border border-amber-200/70 dark:border-amber-900">
                              <div className="text-slate-800 dark:text-slate-200">{n.note}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{n.author_name} · {formatDateTime(n.created_at)}</div>
                            </div>
                          ))
                        )}
                      </div>
                      <ViewMoreFooter
                        totalCount={detailNotesBox.totalCount}
                        visibleCount={detailNotesBox.visibleCount}
                        initialLimit={5}
                        expanded={detailNotesBox.expanded}
                        onToggle={detailNotesBox.toggleExpanded}
                        className="-mx-4 -mb-4 rounded-b-xl"
                      />
                    </div>

                    {/* Status History */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                      <h3 className="font-bold text-slate-900 dark:text-white">{t('recruitment.auditHistoryTitle')}</h3>
                      <div className="space-y-1.5">
                        {detailHistoryBox.visibleItems.map((h) => (
                          <div key={h.id} className="flex justify-between gap-2 text-[11px] border-b last:border-0 border-slate-200 dark:border-slate-800 pb-1">
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">{t(`status.${h.new_status}`, { defaultValue: h.new_status.replace(/_/g, ' ') })}</span>
                              {h.note ? ` — ${h.note}` : ''}
                            </div>
                            <span className="text-slate-400 tabular-nums shrink-0">{formatDateTime(h.changed_at)}</span>
                          </div>
                        ))}
                      </div>
                      <ViewMoreFooter
                        totalCount={detailHistoryBox.totalCount}
                        visibleCount={detailHistoryBox.visibleCount}
                        initialLimit={6}
                        expanded={detailHistoryBox.expanded}
                        onToggle={detailHistoryBox.toggleExpanded}
                        className="-mx-4 -mb-4 rounded-b-xl"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE / EDIT VACANCY MODAL */}
      {vacancyModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
          <form
            onSubmit={handleSaveVacancy}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-up text-xs"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0B192C] dark:text-white">
                {vacancyForm.id ? t('recruitment.editVacancyTitle') : t('recruitment.postVacancyTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setVacancyModalOpen(false)}
                className="p-1.5 text-slate-500 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.jobTitleLabel')}</label>
                  <input
                    required
                    value={vacancyForm.title}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, title: e.target.value })}
                    placeholder={t('recruitment.jobTitlePlaceholder')}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.locationLabel')}</label>
                  <input
                    required
                    value={vacancyForm.location}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, location: e.target.value })}
                    placeholder={t('recruitment.locationPlaceholder')}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.branchOptLabel')}</label>
                  <select
                    value={vacancyForm.branch_id}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, branch_id: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">{t('recruitment.allBranchesHq')}</option>
                    {(workspace?.branches || []).map((br) => (
                      <option key={br.id} value={br.id}>{br.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.deptLabel')}</label>
                  <input
                    value={vacancyForm.department}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, department: e.target.value })}
                    placeholder={t('recruitment.deptPlaceholder')}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.empTypeLabel')}</label>
                  <select
                    value={vacancyForm.employment_type}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, employment_type: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="full_time">{t('employmentTypes.full_time')}</option>
                    <option value="part_time">{t('employmentTypes.part_time')}</option>
                    <option value="contract">{t('employmentTypes.contract')}</option>
                    <option value="internship">{t('employmentTypes.internship')}</option>
                    <option value="temporary">{t('employmentTypes.temporary')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.workModeLabel')}</label>
                  <select
                    value={vacancyForm.work_mode}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, work_mode: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="on_site">{t('workModes.on_site')}</option>
                    <option value="hybrid">{t('workModes.hybrid')}</option>
                    <option value="remote">{t('workModes.remote')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.deadlineFieldLabel')}</label>
                  <input
                    type="date"
                    value={vacancyForm.application_deadline}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, application_deadline: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.openingsLabel')}</label>
                  <input
                    type="number"
                    min="1"
                    value={vacancyForm.positions_count}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, positions_count: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.salaryMinLabel')}</label>
                  <input
                    type="number"
                    min="0"
                    value={vacancyForm.salary_min}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, salary_min: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.salaryMaxLabel')}</label>
                  <input
                    type="number"
                    min="0"
                    value={vacancyForm.salary_max}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, salary_max: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.roleDescLabel')}</label>
                <textarea
                  required
                  rows={3}
                  value={vacancyForm.description}
                  onChange={(e) => setVacancyForm({ ...vacancyForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.respLabel')}</label>
                  <textarea
                    rows={3}
                    value={vacancyForm.responsibilities}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, responsibilities: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('recruitment.reqLabel')}</label>
                  <textarea
                    rows={3}
                    value={vacancyForm.requirements}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, requirements: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              {/* Required Documents Checklist */}
              <div className="space-y-2">
                <div className="font-semibold text-slate-700 dark:text-slate-200">{t('recruitment.reqDocsLabel')}</div>
                <div className="flex flex-wrap gap-2">
                  {DOCUMENT_PRESET_TYPES.map((dt) => {
                    const checked = vacancyForm.required_document_types.includes(dt);
                    return (
                      <button
                        key={dt}
                        type="button"
                        onClick={() => toggleDocRequirement(dt)}
                        className={`px-2.5 py-1 rounded-lg border font-medium ${
                          checked
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {checked ? '✓ ' : ''}{dt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Questions Builder */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="font-bold text-slate-800 dark:text-slate-200">{t('recruitment.customQuestionsTitle')}</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={newQuestionLabel}
                    onChange={(e) => setNewQuestionLabel(e.target.value)}
                    placeholder={t('recruitment.questionPlaceholder')}
                    className="flex-1 min-w-[200px] px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={newQuestionReq}
                      onChange={(e) => setNewQuestionReq(e.target.checked)}
                    />
                    {t('recruitment.requiredLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={addCustomQuestion}
                    className="px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg"
                  >
                    {t('recruitment.addQuestionBtn')}
                  </button>
                </div>
                {vacancyForm.custom_questions.length > 0 && (
                  <div className="space-y-1.5">
                    {vacancyForm.custom_questions.map((q, idx) => (
                      <div key={q.key || idx} className="flex items-center justify-between gap-2 p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span>{q.label} {q.required ? t('recruitment.requiredTag') : t('recruitment.optionalTag')}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setVacancyForm((prev) => ({
                              ...prev,
                              custom_questions: prev.custom_questions.filter((_, i) => i !== idx),
                            }))
                          }
                          className="font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                        >
                          {t('common.remove')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-5 pt-1">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vacancyForm.show_salary}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, show_salary: e.target.checked })}
                  />
                  {t('recruitment.showSalaryLabel')}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vacancyForm.allow_reapplication}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, allow_reapplication: e.target.checked })}
                  />
                  {t('recruitment.allowReapplyLabel')}
                </label>
                {!vacancyForm.id && (
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={vacancyForm.publish_now}
                      onChange={(e) => setVacancyForm({ ...vacancyForm, publish_now: e.target.checked })}
                    />
                    {t('recruitment.publishNowLabel')}
                  </label>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVacancyModalOpen(false)}
                className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={savingVacancy}
                className="px-5 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50"
              >
                {savingVacancy ? t('common.saving') : vacancyForm.id ? t('recruitment.updateVacancyBtn') : t('recruitment.saveVacancyBtn')}
              </button>
            </div>
          </form>
        </div>
      )}

      <PrivateDocumentPreviewModal document={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}
