import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Briefcase,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Layers,
  MessageSquareText,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PublicHeader from '../../components/PublicHeader.jsx';
import PublicFooter from '../../components/PublicFooter.jsx';
import PrivateDocumentPreviewModal, { downloadPrivateDocument } from '../../components/PrivateDocumentPreviewModal.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../services/api.js';
import { formatDate, formatMoney } from '../../utils/format.js';

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

const EDUCATION_STATUSES = ['Completed', 'In Progress', 'Graduated'];

const CERTIFICATE_TYPES = [
  'Academic Certificate',
  'Diploma',
  'Degree Certificate',
  'Transcript',
  'Professional License',
  'National ID',
  'Recommendation Letter',
  'Training Certificate',
];

const QUICK_LANGUAGES = ['English', 'Kinyarwanda', 'French', 'Swahili'];

const STEPS = [
  { id: 1, titleKey: 'jobApply.step1', icon: User },
  { id: 2, titleKey: 'jobApply.step2', icon: GraduationCap },
  { id: 3, titleKey: 'jobApply.step3', icon: Award },
  { id: 4, titleKey: 'jobApply.step4', icon: Briefcase },
  { id: 5, titleKey: 'jobApply.step5', icon: FileText },
  { id: 6, titleKey: 'jobApply.step6', icon: Layers },
  { id: 7, titleKey: 'jobApply.step7', icon: MessageSquareText },
  { id: 8, titleKey: 'jobApply.step8', icon: CheckCircle2 },
];

const EMPTY_EDU = {
  education_level: "Bachelor's Degree",
  institution_name: '',
  field_of_study: '',
  qualification_obtained: '',
  start_year: '',
  graduation_year: '',
  country: 'Rwanda',
  education_status: 'Completed',
};

const EMPTY_EXP = {
  company_name: '',
  job_title: '',
  employment_type: 'Full-Time',
  work_location: '',
  start_date: '',
  end_date: '',
  is_current: false,
  responsibilities: '',
  achievements: '',
  reason_for_leaving: '',
  reference_person: '',
  reference_phone: '',
};

export default function JobApplicationFormPage() {
  const { t } = useTranslation();
  const { id: vacancyId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [submittedResult, setSubmittedResult] = useState(null);

  const [vacancy, setVacancy] = useState(null);
  const [application, setApplication] = useState(null);

  const [personalForm, setPersonalForm] = useState({
    full_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    nationality: 'Rwandan',
    country: 'Rwanda',
    province: '',
    district: '',
    sector: '',
    residential_address: '',
  });
  const [educationList, setEducationList] = useState([]);
  const [hasWorkExperience, setHasWorkExperience] = useState(false);
  const [experienceList, setExperienceList] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [skillsSummaryForm, setSkillsSummaryForm] = useState({
    years_of_experience: 0,
    skills_summary: '',
    availability: 'Immediate',
    preferred_employment_type: 'Full-Time',
    expected_salary: '',
  });
  const [skillsList, setSkillsList] = useState([]);
  const [skillDraft, setSkillDraft] = useState({
    skill_category: 'technical',
    skill_name: '',
    proficiency_level: 'Intermediate',
    notes: '',
  });
  const [jobQuestionsForm, setJobQuestionsForm] = useState({
    why_want_position: '',
    why_select_you: '',
    cover_letter: '',
  });
  const [customAnswersMap, setCustomAnswersMap] = useState({});
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);

  // Upload states
  const [cvProgress, setCvProgress] = useState(0);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [certProgress, setCertProgress] = useState(0);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certMeta, setCertMeta] = useState({ document_type: 'Academic Certificate', document_name: '' });
  const [previewDoc, setPreviewDoc] = useState(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const hydrateFromDraftResponse = useCallback((data) => {
    const app = data.application;
    const vac = data.vacancy;
    setApplication(app);
    setVacancy(vac);
    setPersonalForm({
      full_name: app.full_name || '',
      date_of_birth: app.date_of_birth || '',
      gender: app.gender || '',
      phone: app.phone || '',
      email: app.email || '',
      nationality: app.nationality || 'Rwandan',
      country: app.country || 'Rwanda',
      province: app.province || '',
      district: app.district || '',
      sector: app.sector || '',
      residential_address: app.residential_address || '',
    });
    setEducationList(
      data.education?.length
        ? data.education.map((e) => ({
            education_level: e.education_level || "Bachelor's Degree",
            institution_name: e.institution_name || '',
            field_of_study: e.field_of_study || '',
            qualification_obtained: e.qualification_obtained || '',
            start_year: e.start_year ? String(e.start_year) : '',
            graduation_year: e.graduation_year ? String(e.graduation_year) : '',
            country: e.country || 'Rwanda',
            education_status: e.education_status || 'Completed',
          }))
        : [{ ...EMPTY_EDU }]
    );
    setHasWorkExperience(Boolean(app.has_work_experience));
    setExperienceList(
      data.experiences?.length
        ? data.experiences.map((ex) => ({
            company_name: ex.company_name || '',
            job_title: ex.job_title || '',
            employment_type: ex.employment_type || 'Full-Time',
            work_location: ex.work_location || '',
            start_date: ex.start_date || '',
            end_date: ex.end_date || '',
            is_current: Boolean(ex.is_current),
            responsibilities: ex.responsibilities || '',
            achievements: ex.achievements || '',
            reason_for_leaving: ex.reason_for_leaving || '',
            reference_person: ex.reference_person || '',
            reference_phone: ex.reference_phone || '',
          }))
        : []
    );
    setDocuments(data.documents || []);
    setSkillsSummaryForm({
      years_of_experience: app.years_of_experience || 0,
      skills_summary: app.skills_summary || '',
      availability: app.availability || 'Immediate',
      preferred_employment_type: app.preferred_employment_type || 'Full-Time',
      expected_salary: app.expected_salary !== null && app.expected_salary !== undefined ? String(app.expected_salary) : '',
    });
    setSkillsList(
      (data.skills || []).map((s) => ({
        skill_category: s.skill_category || 'technical',
        skill_name: s.skill_name || '',
        proficiency_level: s.proficiency_level || 'Intermediate',
        notes: s.notes || '',
      }))
    );
    setJobQuestionsForm({
      why_want_position: app.why_want_position || '',
      why_select_you: app.why_select_you || '',
      cover_letter: app.cover_letter || '',
    });
    const ansObj = {};
    for (const ans of data.answers || []) {
      ansObj[ans.question_key] = ans.answer_text || '';
    }
    setCustomAnswersMap(ansObj);
    setAccuracyConfirmed(Boolean(app.accuracy_confirmed));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    setDuplicateInfo(null);
    api
      .post(`/customer/jobs/${vacancyId}/draft`)
      .then(({ data }) => hydrateFromDraftResponse(data))
      .catch((err) => {
        if (err.status === 409) {
          setDuplicateInfo({ message: err.message });
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [vacancyId, hydrateFromDraftResponse]);

  const buildSavePayload = () => {
    const customQuestions = vacancy?.custom_questions || [];
    const answers = customQuestions.map((q) => ({
      question_key: q.key,
      question_label: q.label,
      answer_text: customAnswersMap[q.key] || '',
    }));

    return {
      ...personalForm,
      has_work_experience: hasWorkExperience ? 1 : 0,
      years_of_experience: hasWorkExperience ? Number(skillsSummaryForm.years_of_experience || 0) : 0,
      skills_summary: skillsSummaryForm.skills_summary,
      availability: skillsSummaryForm.availability,
      preferred_employment_type: skillsSummaryForm.preferred_employment_type,
      expected_salary: skillsSummaryForm.expected_salary,
      why_want_position: jobQuestionsForm.why_want_position,
      why_select_you: jobQuestionsForm.why_select_you,
      cover_letter: jobQuestionsForm.cover_letter,
      accuracy_confirmed: accuracyConfirmed,
      education: educationList.filter((e) => e.institution_name.trim()),
      experiences: hasWorkExperience ? experienceList.filter((ex) => ex.company_name.trim()) : [],
      skills: skillsList.filter((s) => s.skill_name.trim()),
      answers,
    };
  };

  const persistDraft = async ({ silent = false } = {}) => {
    if (!application?.id || saving) return false;
    setSaving(true);
    if (!silent) {
      setError('');
      setNotice('');
    }
    try {
      const { data } = await api.put(`/customer/applications/${application.id}`, buildSavePayload());
      setApplication(data.application);
      if (!silent) setNotice(t('jobApply.draftSavedMsg'));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goToStep = async (targetStep) => {
    if (targetStep === step) return;
    await persistDraft({ silent: true });
    setStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCvUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !application?.id || uploadingCv) return;
    setError('');
    setNotice('');

    if (file.size === 0) {
      setError(t('validation.emptyFile'));
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const isGenericMime = !file.type || file.type === 'application/octet-stream';
    const validType = allowedMimes.includes(file.type) || (isGenericMime && ['pdf', 'docx'].includes(ext));
    if (!validType || !['pdf', 'docx'].includes(ext)) {
      setError(t('validation.unsupportedDocFormat'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('validation.documentTooLarge'));
      return;
    }

    setUploadingCv(true);
    setCvProgress(0);

    try {
      const formData = new FormData();
      formData.append('cv', file);
      const { data } = await api.post(`/customer/applications/${application.id}/cv`, formData, {
        timeout: 0,
        onUploadProgress: (evt) => {
          if (evt.total) setCvProgress(Math.round((evt.loaded * 100) / evt.total));
        },
      });
      setDocuments((prev) => [data.document, ...prev.filter((d) => d.document_category !== 'cv')]);
      setNotice(t('jobApply.cvUploadedMsg'));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingCv(false);
      setCvProgress(0);
    }
  };

  const handleCertificateUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0 || !application?.id || uploadingCert) return;
    setError('');
    setNotice('');

    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png'];
    for (const file of files) {
      if (file.size === 0) {
        setError(t('validation.emptyFile'));
        return;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isGenericMime = !file.type || file.type === 'application/octet-stream';
      const validType = allowedMimes.includes(file.type) || (isGenericMime && allowedExts.includes(ext));
      if (!validType || !allowedExts.includes(ext)) {
        setError(t('validation.unsupportedDocFormat'));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(t('validation.documentTooLarge'));
        return;
      }
    }

    setUploadingCert(true);
    setCertProgress(0);

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const formData = new FormData();
        formData.append('document', file);
        formData.append('document_type', certMeta.document_type || 'Academic Certificate');
        formData.append('document_name', certMeta.document_name.trim() || file.name);
        const { data } = await api.post(`/customer/applications/${application.id}/documents`, formData, {
          timeout: 0,
          onUploadProgress: (evt) => {
            if (evt.total) {
              const overall = Math.round(((i + evt.loaded / evt.total) / files.length) * 100);
              setCertProgress(overall);
            }
          },
        });
        setDocuments((prev) => [...prev, data.document]);
      }
      setCertMeta((prev) => ({ ...prev, document_name: '' }));
      setNotice(t('jobApply.docsUploadedMsg', { count: files.length }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingCert(false);
      setCertProgress(0);
    }
  };

  const handleRemoveDocument = async (docId) => {
    if (!application?.id) return;
    setError('');
    try {
      await api.delete(`/customer/applications/${application.id}/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setNotice(t('jobApply.docRemovedMsg'));
    } catch (err) {
      setError(err.message);
    }
  };

  const addSkill = (override) => {
    const next = override || skillDraft;
    if (!String(next.skill_name || '').trim()) return;
    const exists = skillsList.some(
      (s) =>
        s.skill_category === next.skill_category &&
        s.skill_name.toLowerCase() === next.skill_name.trim().toLowerCase()
    );
    if (exists) return;
    setSkillsList((prev) => [
      ...prev,
      {
        skill_category: next.skill_category,
        skill_name: next.skill_name.trim(),
        proficiency_level: next.proficiency_level || 'Intermediate',
        notes: next.notes || '',
      },
    ]);
    if (!override) setSkillDraft((prev) => ({ ...prev, skill_name: '', notes: '' }));
  };

  const handleSubmitApplication = async () => {
    if (!application?.id || submitting) return;
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const savedOk = await persistDraft({ silent: true });
      if (!savedOk) {
        setSubmitting(false);
        return;
      }
      const { data } = await api.post(`/customer/applications/${application.id}/submit`, {
        accuracy_confirmed: accuracyConfirmed,
      });
      setSubmittedResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!application?.id) return;
    try {
      await api.delete(`/customer/applications/${application.id}`);
      setCancelConfirmOpen(false);
      navigate('/jobs');
    } catch (err) {
      setError(err.message);
      setCancelConfirmOpen(false);
    }
  };

  const activeCv = documents.find((d) => d.document_category === 'cv');
  const certificates = documents.filter((d) => d.document_category === 'certificate');
  const requiredDocTypes = vacancy?.required_document_types || [];

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <PublicHeader />
        <main className="flex-1 max-w-5xl mx-auto px-6 py-16 w-full">
          <div className="h-64 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (duplicateInfo) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <PublicHeader />
        <main className="flex-1 max-w-2xl mx-auto px-6 py-16 w-full">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
            <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{t('jobApply.dupTitle')}</h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{duplicateInfo.message}</p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link
                to="/customer?tab=applications"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
              >
                {t('jobApply.trackMyApps')}
              </Link>
              <Link
                to="/jobs"
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('jobApply.browseOtherVacancies')}
              </Link>
            </div>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (submittedResult) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <PublicHeader />
        <main className="flex-1 max-w-2xl mx-auto px-6 py-16 w-full animate-fade-up">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">{t('jobApply.submittedTitle')}</h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {t('jobApply.submittedFor')} <strong>{vacancy?.title}</strong> {t('jobApply.submittedAt')} <strong>{vacancy?.business_name}</strong> {t('jobApply.submittedReceived')}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('jobApply.refNumLabel')}</div>
              <div className="text-xl font-bold font-mono text-[#0B192C] dark:text-sky-400 mt-1">
                {submittedResult.reference_number}
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('jobApply.submittedPortalHint')}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link
                to={`/customer?tab=applications&applicationId=${submittedResult.application?.id || application?.id}`}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
              >
                {t('jobApply.viewTrackStatus')}
              </Link>
              <Link
                to="/jobs"
                className="px-5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('jobApply.exploreMore')}
              </Link>
            </div>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <PublicHeader />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full space-y-6 animate-fade-up">
        {!vacancy ? (
          <div className="p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-rose-700 dark:text-rose-300">
            {error || t('jobApply.unableStart')}
          </div>
        ) : (
          <>
            {/* Vacancy Banner */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <Link to={`/jobs/${vacancy.id}`} className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t('jobApply.vacancyDetails')}
                </Link>
                <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">{vacancy.title}</h1>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {vacancy.business_name} · {vacancy.location}{vacancy.department ? ` · ${vacancy.department}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => persistDraft()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? t('common.saving') : t('jobApply.saveDraftBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelConfirmOpen(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  {t('jobApply.discardDraftBtn')}
                </button>
              </div>
            </div>

            {/* Stepper */}
            <nav aria-label={t('jobApply.stepsAria')} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <div className="flex items-center gap-1.5 min-w-max">
                {STEPS.map((s) => {
                  const Icon = s.icon;
                  const active = step === s.id;
                  const completed = step > s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => goToStep(s.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#0B192C] dark:bg-sky-600 text-white'
                          : completed
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {completed ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                      <span>{s.id}. {t(s.titleKey)}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
            {notice && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">{notice}</div>}

            {/* Step Card */}
            <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 space-y-6 text-xs">
              {/* STEP 1: Personal Information */}
              {step === 1 && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('jobApply.step1Title')}</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {t('jobApply.step1Desc')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
                      <UserAvatar src={application?.profile_photo_url || user?.avatar_url} name={personalForm.full_name} size="md" />
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{t('jobApply.verifiedPhoto')}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('jobApply.includedAuto')}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.fullName')}</label>
                      <input
                        required
                        value={personalForm.full_name}
                        onChange={(e) => setPersonalForm({ ...personalForm, full_name: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.phone')}</label>
                      <input
                        required
                        value={personalForm.phone}
                        onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.email')}</label>
                      <input
                        required
                        type="email"
                        value={personalForm.email}
                        onChange={(e) => setPersonalForm({ ...personalForm, email: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.dob')}</label>
                      <input
                        type="date"
                        value={personalForm.date_of_birth}
                        onChange={(e) => setPersonalForm({ ...personalForm, date_of_birth: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.gender')}</label>
                      <select
                        value={personalForm.gender}
                        onChange={(e) => setPersonalForm({ ...personalForm, gender: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="">{t('jobApply.selectOptional')}</option>
                        <option value="Female">{t('jobApply.female')}</option>
                        <option value="Male">{t('jobApply.male')}</option>
                        <option value="Prefer not to say">{t('jobApply.preferNotSay')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.nationality')}</label>
                      <input
                        value={personalForm.nationality}
                        onChange={(e) => setPersonalForm({ ...personalForm, nationality: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.country')}</label>
                      <input
                        value={personalForm.country}
                        onChange={(e) => setPersonalForm({ ...personalForm, country: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.province')}</label>
                      <input
                        value={personalForm.province}
                        onChange={(e) => setPersonalForm({ ...personalForm, province: e.target.value })}
                        placeholder={t('jobApply.provincePlaceholder')}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.district')}</label>
                      <input
                        value={personalForm.district}
                        onChange={(e) => setPersonalForm({ ...personalForm, district: e.target.value })}
                        placeholder={t('jobApply.districtPlaceholder')}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.sector')}</label>
                      <input
                        value={personalForm.sector}
                        onChange={(e) => setPersonalForm({ ...personalForm, sector: e.target.value })}
                        placeholder={t('jobApply.sectorPlaceholder')}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.residentialAddress')}</label>
                      <input
                        value={personalForm.residential_address}
                        onChange={(e) => setPersonalForm({ ...personalForm, residential_address: e.target.value })}
                        placeholder={t('jobApply.addressPlaceholder')}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Educational Background */}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('jobApply.step2Title')}</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {t('jobApply.step2Desc')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEducationList((prev) => [...prev, { ...EMPTY_EDU }])}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('jobApply.addEduBtn')}
                    </button>
                  </div>

                  {educationList.map((edu, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{t('jobApply.eduRecordTitle', { num: idx + 1 })}</span>
                        {educationList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setEducationList((prev) => prev.filter((_, i) => i !== idx))}
                            className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:underline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('common.remove')}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.eduLevelLabel')}</label>
                          <select
                            value={edu.education_level}
                            onChange={(e) =>
                              setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, education_level: e.target.value } : it)))
                            }
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                          >
                            {EDUCATION_LEVELS.map((lvl) => (
                              <option key={lvl} value={lvl}>{lvl}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.institutionLabel')}</label>
                          <input
                            value={edu.institution_name}
                            onChange={(e) =>
                              setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, institution_name: e.target.value } : it)))
                            }
                            placeholder={t('jobApply.institutionPlaceholder')}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.fieldLabel')}</label>
                          <input
                            value={edu.field_of_study}
                            onChange={(e) =>
                              setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, field_of_study: e.target.value } : it)))
                            }
                            placeholder={t('jobApply.fieldPlaceholder')}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.qualLabel')}</label>
                          <input
                            value={edu.qualification_obtained}
                            onChange={(e) =>
                              setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, qualification_obtained: e.target.value } : it)))
                            }
                            placeholder={t('jobApply.qualPlaceholder')}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.startYear')}</label>
                            <input
                              type="number"
                              min="1960"
                              max="2035"
                              value={edu.start_year}
                              onChange={(e) =>
                                setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, start_year: e.target.value } : it)))
                              }
                              placeholder="2019"
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.gradYear')}</label>
                            <input
                              type="number"
                              min="1960"
                              max="2035"
                              value={edu.graduation_year}
                              onChange={(e) =>
                                setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, graduation_year: e.target.value } : it)))
                              }
                              placeholder="2023"
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.country')}</label>
                            <input
                              value={edu.country}
                              onChange={(e) =>
                                setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, country: e.target.value } : it)))
                              }
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('common.status')}</label>
                            <select
                              value={edu.education_status}
                              onChange={(e) =>
                                setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, education_status: e.target.value } : it)))
                              }
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                            >
                              {EDUCATION_STATUSES.map((st) => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* STEP 3: Diplomas & Certificates */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('jobApply.step3Title')}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('jobApply.step3Desc')}
                    </p>
                  </div>

                  {requiredDocTypes.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-1.5">
                      <div className="font-semibold text-amber-900 dark:text-amber-200">{t('jobApply.reqDocsVacancyTitle')}</div>
                      <div className="flex flex-wrap gap-2">
                        {requiredDocTypes.map((reqType) => {
                          const hasIt = certificates.some((c) => c.document_type.toLowerCase() === reqType.toLowerCase());
                          return (
                            <span
                              key={reqType}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-semibold ${
                                hasIt
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                              }`}
                            >
                              {hasIt ? <Check className="w-3 h-3" /> : null}
                              {reqType}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.docCategoryLabel')}</label>
                      <select
                        value={certMeta.document_type}
                        onChange={(e) => setCertMeta({ ...certMeta, document_type: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        {Array.from(new Set([...requiredDocTypes, ...CERTIFICATE_TYPES])).map((dt) => (
                          <option key={dt} value={dt}>{dt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.docNameLabel')}</label>
                      <input
                        value={certMeta.document_name}
                        onChange={(e) => setCertMeta({ ...certMeta, document_name: e.target.value })}
                        placeholder={t('jobApply.docNamePlaceholder')}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingCert ? t('jobApply.uploadingProgress', { pct: certProgress }) : t('jobApply.selectFilesBtn')}</span>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png"
                          disabled={uploadingCert}
                          onChange={handleCertificateUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {certificates.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400">
                      {t('jobApply.noCertsUploaded')}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      {certificates.map((doc) => (
                        <div key={doc.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">{doc.document_name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {doc.document_type} · {doc.original_filename} · {Math.max(1, Math.round((doc.file_size_bytes || 0) / 1024))} KB
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {t('customerPortal.preview')}
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadPrivateDocument(doc.download_url, doc.original_filename)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {t('common.download')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDocument(doc.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              {t('common.remove')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: Work Experience */}
              {step === 4 && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('jobApply.step4Title')}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('jobApply.step4Desc')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setHasWorkExperience(true);
                        if (experienceList.length === 0) setExperienceList([{ ...EMPTY_EXP }]);
                      }}
                      className={`p-4 rounded-xl border text-left transition-colors ${
                        hasWorkExperience
                          ? 'bg-sky-50/70 dark:bg-sky-950/40 border-sky-600 dark:border-sky-500'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className="font-bold text-slate-900 dark:text-white">{t('jobApply.expYesTitle')}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {t('jobApply.expYesDesc')}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasWorkExperience(false)}
                      className={`p-4 rounded-xl border text-left transition-colors ${
                        !hasWorkExperience
                          ? 'bg-sky-50/70 dark:bg-sky-950/40 border-sky-600 dark:border-sky-500'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className="font-bold text-slate-900 dark:text-white">{t('jobApply.expNoTitle')}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {t('jobApply.expNoDesc')}
                      </div>
                    </button>
                  </div>

                  {!hasWorkExperience ? (
                    <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200">
                      {t('jobApply.expNoConfirmed')}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setExperienceList((prev) => [...prev, { ...EMPTY_EXP }])}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {t('jobApply.addExpBtn')}
                        </button>
                      </div>

                      {experienceList.map((exp, idx) => (
                        <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{t('jobApply.expRecordTitle', { num: idx + 1 })}</span>
                            {experienceList.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setExperienceList((prev) => prev.filter((_, i) => i !== idx))}
                                className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:underline"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {t('common.remove')}
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.companyLabel')}</label>
                              <input
                                value={exp.company_name}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, company_name: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.jobTitleLabel')}</label>
                              <input
                                value={exp.job_title}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, job_title: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.empTypeLabel')}</label>
                              <input
                                value={exp.employment_type}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, employment_type: e.target.value } : it)))
                                }
                                placeholder={t('jobApply.empTypePlaceholder')}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.workLocLabel')}</label>
                              <input
                                value={exp.work_location}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, work_location: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.startDateLabel')}</label>
                              <input
                                type="date"
                                value={exp.start_date}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, start_date: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="font-semibold text-slate-700 dark:text-slate-300">{t('jobApply.endDateLabel')}</label>
                                <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                                  <input
                                    type="checkbox"
                                    checked={exp.is_current}
                                    onChange={(e) =>
                                      setExperienceList((prev) =>
                                        prev.map((it, i) => (i === idx ? { ...it, is_current: e.target.checked, end_date: '' } : it))
                                      )
                                    }
                                  />
                                  {t('jobApply.currentRoleLabel')}
                                </label>
                              </div>
                              <input
                                type="date"
                                disabled={exp.is_current}
                                value={exp.end_date}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, end_date: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-50"
                              />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.keyRespLabel')}</label>
                              <textarea
                                rows={2}
                                value={exp.responsibilities}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, responsibilities: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.reasonLeavingLabel')}</label>
                              <input
                                value={exp.reason_for_leaving}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, reason_for_leaving: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.refPersonLabel')}</label>
                              <input
                                value={exp.reference_person}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, reference_person: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.refPhoneLabel')}</label>
                              <input
                                value={exp.reference_phone}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, reference_phone: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 5: Mandatory CV Upload */}
              {step === 5 && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('jobApply.step5Title')}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('jobApply.step5Desc')}
                    </p>
                  </div>

                  <div className="p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-center space-y-3">
                    <FileText className="w-9 h-9 text-sky-600 dark:text-sky-400 mx-auto" />
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {activeCv ? t('jobApply.replaceCvHeading') : t('jobApply.uploadCvHeading')}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('jobApply.cvFormatsHint')}
                    </p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingCv ? t('jobApply.uploadingCvProgress', { pct: cvProgress }) : activeCv ? t('jobApply.uploadReplacementCv') : t('jobApply.chooseCvFile')}</span>
                      <input
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        disabled={uploadingCv}
                        onChange={handleCvUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {activeCv && (
                    <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-emerald-900 dark:text-emerald-200">{t('jobApply.activeCvReady', { name: activeCv.original_filename })}</div>
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                          {Math.max(1, Math.round((activeCv.file_size_bytes || 0) / 1024))} KB · {activeCv.mime_type}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(activeCv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {t('customerPortal.preview')}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPrivateDocument(activeCv.download_url, activeCv.original_filename)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {t('common.download')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocument(activeCv.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('common.remove')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 6: Skills, Languages & Availability */}
              {step === 6 && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('jobApply.step6Title')}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('jobApply.step6Desc')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.totalYearsLabel')}</label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        disabled={!hasWorkExperience}
                        value={hasWorkExperience ? skillsSummaryForm.years_of_experience : 0}
                        onChange={(e) => setSkillsSummaryForm({ ...skillsSummaryForm, years_of_experience: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.availabilityLabel')}</label>
                      <input
                        value={skillsSummaryForm.availability}
                        onChange={(e) => setSkillsSummaryForm({ ...skillsSummaryForm, availability: e.target.value })}
                        placeholder={t('jobApply.availabilityPlaceholder')}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.preferredEmpLabel')}</label>
                      <select
                        value={skillsSummaryForm.preferred_employment_type}
                        onChange={(e) => setSkillsSummaryForm({ ...skillsSummaryForm, preferred_employment_type: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="Full-Time">{t('employmentTypes.full_time')}</option>
                        <option value="Part-Time">{t('employmentTypes.part_time')}</option>
                        <option value="Contract">{t('employmentTypes.contract')}</option>
                        <option value="Internship">{t('employmentTypes.internship')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.expectedSalaryLabel', { currency: vacancy.currency_code || 'RWF' })}</label>
                      <input
                        type="number"
                        min="0"
                        value={skillsSummaryForm.expected_salary}
                        onChange={(e) => setSkillsSummaryForm({ ...skillsSummaryForm, expected_salary: e.target.value })}
                        placeholder={t('common.optional')}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('jobApply.skillsSummaryLabel')}</label>
                    <textarea
                      rows={3}
                      value={skillsSummaryForm.skills_summary}
                      onChange={(e) => setSkillsSummaryForm({ ...skillsSummaryForm, skills_summary: e.target.value })}
                      placeholder={t('jobApply.skillsSummaryPlaceholder')}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>

                  {/* Quick Language Chips */}
                  <div className="space-y-2">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">{t('jobApply.quickLanguagesTitle')}</div>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_LANGUAGES.map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => addSkill({ skill_category: 'language', skill_name: lang, proficiency_level: 'Fluent', notes: '' })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          <Plus className="w-3 h-3" />
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Add Custom Skill/Language */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.categoryLabel')}</label>
                      <select
                        value={skillDraft.skill_category}
                        onChange={(e) => setSkillDraft({ ...skillDraft, skill_category: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="technical">{t('jobApply.catTechnical')}</option>
                        <option value="professional">{t('jobApply.catProfessional')}</option>
                        <option value="computer">{t('jobApply.catComputer')}</option>
                        <option value="training">{t('jobApply.catTraining')}</option>
                        <option value="language">{t('jobApply.catLanguage')}</option>
                        <option value="other">{t('jobApply.catOther')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.skillNameLabel')}</label>
                      <input
                        value={skillDraft.skill_name}
                        onChange={(e) => setSkillDraft({ ...skillDraft, skill_name: e.target.value })}
                        placeholder={t('jobApply.skillNamePlaceholder')}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('jobApply.proficiencyLabel')}</label>
                      <select
                        value={skillDraft.proficiency_level}
                        onChange={(e) => setSkillDraft({ ...skillDraft, proficiency_level: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="Beginner">{t('jobApply.profBeginner')}</option>
                        <option value="Intermediate">{t('jobApply.profIntermediate')}</option>
                        <option value="Advanced">{t('jobApply.profAdvanced')}</option>
                        <option value="Fluent">{t('jobApply.profFluent')}</option>
                        <option value="Native">{t('jobApply.profNative')}</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => addSkill()}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('jobApply.addSkillBtn')}
                    </button>
                  </div>

                  {skillsList.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {skillsList.map((s, idx) => (
                        <div
                          key={`${s.skill_category}-${s.skill_name}-${idx}`}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                        >
                          <span className="font-semibold text-slate-900 dark:text-white">{s.skill_name}</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            ({s.skill_category} · {s.proficiency_level})
                          </span>
                          <button
                            type="button"
                            onClick={() => setSkillsList((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700"
                            aria-label={`${t('common.remove')} ${s.skill_name}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 7: Job-Specific Questions */}
              {step === 7 && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('jobApply.step7Title')}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('jobApply.step7Prompt', { business: vacancy.business_name, title: vacancy.title })}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        {t('jobApply.whyWantQ')}
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={jobQuestionsForm.why_want_position}
                        onChange={(e) => setJobQuestionsForm({ ...jobQuestionsForm, why_want_position: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        {t('jobApply.whySelectQ')}
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={jobQuestionsForm.why_select_you}
                        onChange={(e) => setJobQuestionsForm({ ...jobQuestionsForm, why_select_you: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        {t('jobApply.coverLetterLabel')}
                      </label>
                      <textarea
                        rows={4}
                        value={jobQuestionsForm.cover_letter}
                        onChange={(e) => setJobQuestionsForm({ ...jobQuestionsForm, cover_letter: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>

                    {(vacancy.custom_questions || []).map((q) => (
                      <div key={q.key}>
                        <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                          {q.label} {q.required ? '*' : `(${t('common.optional')})`}
                        </label>
                        <textarea
                          rows={2}
                          required={Boolean(q.required)}
                          value={customAnswersMap[q.key] || ''}
                          onChange={(e) => setCustomAnswersMap((prev) => ({ ...prev, [q.key]: e.target.value }))}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 8: Review & Submit */}
              {step === 8 && (
                <div className="space-y-5">
                  <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">{t('jobApply.step8Title')}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t('jobApply.step8Desc')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">{t('jobApply.reviewPersonal')}</span>
                        <button type="button" onClick={() => setStep(1)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">{t('common.edit')}</button>
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">{personalForm.full_name} · {personalForm.phone}</div>
                      <div className="text-slate-500 dark:text-slate-400">{personalForm.email} · {personalForm.district || personalForm.country}</div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">{t('jobApply.reviewEducation', { count: educationList.filter((e) => e.institution_name.trim()).length })}</span>
                        <button type="button" onClick={() => setStep(2)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">{t('common.edit')}</button>
                      </div>
                      {educationList.filter((e) => e.institution_name.trim()).map((e, i) => (
                        <div key={i} className="text-slate-600 dark:text-slate-300">
                          {e.education_level} — {e.institution_name} ({e.education_status})
                        </div>
                      ))}
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">{t('jobApply.reviewDocs')}</span>
                        <button type="button" onClick={() => setStep(5)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">{t('common.edit')}</button>
                      </div>
                      <div className={activeCv ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
                        {activeCv ? t('jobApply.cvUploadedPrefix', { name: activeCv.original_filename }) : t('jobApply.missingMandatoryCv')}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {t('jobApply.certsUploadedCount', { count: certificates.length })}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">{t('jobApply.reviewExpSkills')}</span>
                        <button type="button" onClick={() => setStep(4)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">{t('common.edit')}</button>
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">
                        {hasWorkExperience
                          ? t('jobApply.expSummary', { count: experienceList.filter((ex) => ex.company_name.trim()).length, years: skillsSummaryForm.years_of_experience || 0 })
                          : t('jobApply.noPriorExp')}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {t('jobApply.skillsSummaryLine', { count: skillsList.length, avail: skillsSummaryForm.availability || 'N/A' })}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">{t('jobApply.reviewJobResponses')}</span>
                      <button type="button" onClick={() => setStep(7)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">{t('common.edit')}</button>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 line-clamp-2">
                      <strong>{t('jobApply.motivationLabel')}</strong> {jobQuestionsForm.why_want_position || t('jobApply.notAnsweredYet')}
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 line-clamp-2">
                      <strong>{t('jobApply.whySelectLabel')}</strong> {jobQuestionsForm.why_select_you || t('jobApply.notAnsweredYet')}
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 p-4 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={accuracyConfirmed}
                      onChange={(e) => setAccuracyConfirmed(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-slate-800 dark:text-slate-200 leading-relaxed">
                      {t('jobApply.accuracyText')}
                    </span>
                  </label>
                </div>
              )}

              {/* Step Footer Actions */}
              <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={step === 1}
                  onClick={() => goToStep(Math.max(1, step - 1))}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t('common.back')}
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => persistDraft()}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? t('common.saving') : t('jobApply.saveProgressBtn')}
                  </button>

                  {step < 8 ? (
                    <button
                      type="button"
                      onClick={() => goToStep(step + 1)}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                    >
                      {step === 7 ? t('jobApply.reviewAppBtn') : t('jobApply.nextStepBtn')}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submitting || !accuracyConfirmed || !activeCv}
                      onClick={handleSubmitApplication}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {submitting ? t('jobApply.submittingBtn') : t('jobApply.submitAppBtn')}
                    </button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <PublicFooter />

      <PrivateDocumentPreviewModal document={previewDoc} onClose={() => setPreviewDoc(null)} />

      {cancelConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-[#0B192C] dark:text-white">{t('jobApply.discardModalTitle')}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t('jobApply.discardModalDesc')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {t('jobApply.keepEditingBtn')}
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500"
              >
                {t('jobApply.confirmDiscardBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
