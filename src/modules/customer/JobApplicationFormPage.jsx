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
  { id: 1, title: 'Personal Info', icon: User },
  { id: 2, title: 'Education', icon: GraduationCap },
  { id: 3, title: 'Certificates', icon: Award },
  { id: 4, title: 'Work Experience', icon: Briefcase },
  { id: 5, title: 'Mandatory CV', icon: FileText },
  { id: 6, title: 'Skills & Extra', icon: Layers },
  { id: 7, title: 'Job Questions', icon: MessageSquareText },
  { id: 8, title: 'Review & Submit', icon: CheckCircle2 },
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
    if (!application?.id) return false;
    setSaving(true);
    if (!silent) {
      setError('');
      setNotice('');
    }
    try {
      const { data } = await api.put(`/customer/applications/${application.id}`, buildSavePayload());
      setApplication(data.application);
      if (!silent) setNotice('Draft saved cleanly.');
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
    if (!file || !application?.id) return;
    setError('');
    setNotice('');
    setUploadingCv(true);
    setCvProgress(0);

    try {
      const formData = new FormData();
      formData.append('cv', file);
      const { data } = await api.post(`/customer/applications/${application.id}/cv`, formData, {
        onUploadProgress: (evt) => {
          if (evt.total) setCvProgress(Math.round((evt.loaded * 100) / evt.total));
        },
      });
      setDocuments((prev) => [data.document, ...prev.filter((d) => d.document_category !== 'cv')]);
      setNotice('Curriculum Vitae (CV) uploaded securely.');
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
    if (files.length === 0 || !application?.id) return;
    setError('');
    setNotice('');
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
      setNotice(`${files.length} document(s) uploaded cleanly.`);
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
      setNotice('Document removed.');
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
    if (!application?.id) return;
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
            <h1 className="text-xl font-bold text-[#0B192C] dark:text-white">Application Already Submitted</h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{duplicateInfo.message}</p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link
                to="/customer?tab=applications"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
              >
                Track My Applications
              </Link>
              <Link
                to="/jobs"
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Browse Other Vacancies
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
              <h1 className="text-2xl font-bold text-[#0B192C] dark:text-white">Application Submitted Successfully</h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Your application for <strong>{vacancy?.title}</strong> at <strong>{vacancy?.business_name}</strong> has been received.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Unique Application Reference Number</div>
              <div className="text-xl font-bold font-mono text-[#0B192C] dark:text-sky-400 mt-1">
                {submittedResult.reference_number}
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You will receive updates and interview invitations directly inside your Customer Portal.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link
                to={`/customer?tab=applications&applicationId=${submittedResult.application?.id || application?.id}`}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
              >
                View Application & Track Status
              </Link>
              <Link
                to="/jobs"
                className="px-5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Explore More Vacancies
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
            {error || 'Unable to start job application.'}
          </div>
        ) : (
          <>
            {/* Vacancy Banner */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <Link to={`/jobs/${vacancy.id}`} className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Vacancy Details
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
                  {saving ? 'Saving...' : 'Save as Draft'}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelConfirmOpen(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  Discard Draft
                </button>
              </div>
            </div>

            {/* Stepper */}
            <nav aria-label="Application steps" className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
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
                      <span>{s.id}. {s.title}</span>
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
                      <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Step 1: Applicant Personal Information</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Auto-filled from your account. Edits made here update this job application only without changing your login credentials.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800">
                      <UserAvatar src={application?.profile_photo_url || user?.avatar_url} name={personalForm.full_name} size="md" />
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">Verified Profile Photo</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Included automatically</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Full Name *</label>
                      <input
                        required
                        value={personalForm.full_name}
                        onChange={(e) => setPersonalForm({ ...personalForm, full_name: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Phone Number *</label>
                      <input
                        required
                        value={personalForm.phone}
                        onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Email Address *</label>
                      <input
                        required
                        type="email"
                        value={personalForm.email}
                        onChange={(e) => setPersonalForm({ ...personalForm, email: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={personalForm.date_of_birth}
                        onChange={(e) => setPersonalForm({ ...personalForm, date_of_birth: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Gender</label>
                      <select
                        value={personalForm.gender}
                        onChange={(e) => setPersonalForm({ ...personalForm, gender: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="">Select (Optional)</option>
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Nationality</label>
                      <input
                        value={personalForm.nationality}
                        onChange={(e) => setPersonalForm({ ...personalForm, nationality: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Country</label>
                      <input
                        value={personalForm.country}
                        onChange={(e) => setPersonalForm({ ...personalForm, country: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Province / Region</label>
                      <input
                        value={personalForm.province}
                        onChange={(e) => setPersonalForm({ ...personalForm, province: e.target.value })}
                        placeholder="e.g. Kigali City"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">District / City</label>
                      <input
                        value={personalForm.district}
                        onChange={(e) => setPersonalForm({ ...personalForm, district: e.target.value })}
                        placeholder="e.g. Gasabo"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Sector</label>
                      <input
                        value={personalForm.sector}
                        onChange={(e) => setPersonalForm({ ...personalForm, sector: e.target.value })}
                        placeholder="e.g. Kacyiru"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Residential Address</label>
                      <input
                        value={personalForm.residential_address}
                        onChange={(e) => setPersonalForm({ ...personalForm, residential_address: e.target.value })}
                        placeholder="Street, cell, village, or landmark"
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
                      <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Step 2: Educational Background</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Add at least one academic or vocational record. You can include multiple qualifications.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEducationList((prev) => [...prev, { ...EMPTY_EDU }])}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Education Record
                    </button>
                  </div>

                  {educationList.map((edu, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 dark:text-slate-200">Education Record #{idx + 1}</span>
                        {educationList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setEducationList((prev) => prev.filter((_, i) => i !== idx))}
                            className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:underline"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Education Level *</label>
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
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">School / University / Institution *</label>
                          <input
                            value={edu.institution_name}
                            onChange={(e) =>
                              setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, institution_name: e.target.value } : it)))
                            }
                            placeholder="e.g. University of Rwanda"
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Field of Study / Major</label>
                          <input
                            value={edu.field_of_study}
                            onChange={(e) =>
                              setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, field_of_study: e.target.value } : it)))
                            }
                            placeholder="e.g. Accounting & Finance"
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Degree / Diploma / Certificate Title</label>
                          <input
                            value={edu.qualification_obtained}
                            onChange={(e) =>
                              setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, qualification_obtained: e.target.value } : it)))
                            }
                            placeholder="e.g. BSc in Business Administration"
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Start Year</label>
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
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Graduation Year</label>
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
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Country</label>
                            <input
                              value={edu.country}
                              onChange={(e) =>
                                setEducationList((prev) => prev.map((it, i) => (i === idx ? { ...it, country: e.target.value } : it)))
                              }
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
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
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Step 3: Academic Certificates, Diplomas & Supporting Documents</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Upload scanned academic certificates, transcripts, licenses, or IDs (PDF, JPG, JPEG, or PNG, max 10MB each).
                    </p>
                  </div>

                  {requiredDocTypes.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 space-y-1.5">
                      <div className="font-semibold text-amber-900 dark:text-amber-200">Required Supporting Documents for This Vacancy:</div>
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
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Document Category / Type</label>
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
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Document Label (Optional)</label>
                      <input
                        value={certMeta.document_name}
                        onChange={(e) => setCertMeta({ ...certMeta, document_name: e.target.value })}
                        placeholder="e.g. BSc Degree Certificate"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingCert ? `Uploading ${certProgress}%...` : 'Select File(s) to Upload'}</span>
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
                      No supporting certificates or diplomas uploaded yet.
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
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadPrivateDocument(doc.download_url, doc.original_filename)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDocument(doc.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove
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
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Step 4: Work Experience</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Do you have prior professional or internship work experience? Choosing "No" is valid and does not disqualify your application.
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
                      <div className="font-bold text-slate-900 dark:text-white">Yes — I have prior work experience</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Add your previous or current roles, achievements, and references.
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
                      <div className="font-bold text-slate-900 dark:text-white">No — No prior work experience</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Continue cleanly without work history (0 years recorded).
                      </div>
                    </button>
                  </div>

                  {!hasWorkExperience ? (
                    <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200">
                      Work experience marked as <strong>No prior work experience</strong>. You may proceed to Step 5 (Mandatory CV Upload).
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
                          Add Experience Record
                        </button>
                      </div>

                      {experienceList.map((exp, idx) => (
                        <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 dark:text-slate-200">Experience #{idx + 1}</span>
                            {experienceList.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setExperienceList((prev) => prev.filter((_, i) => i !== idx))}
                                className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:underline"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Company / Organization *</label>
                              <input
                                value={exp.company_name}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, company_name: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Job Title / Position *</label>
                              <input
                                value={exp.job_title}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, job_title: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Employment Type</label>
                              <input
                                value={exp.employment_type}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, employment_type: e.target.value } : it)))
                                }
                                placeholder="Full-Time, Internship..."
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Work Location</label>
                              <input
                                value={exp.work_location}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, work_location: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Start Date *</label>
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
                                <label className="font-semibold text-slate-700 dark:text-slate-300">End Date</label>
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
                                  Current Role
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
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Key Responsibilities</label>
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
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reason for Leaving</label>
                              <input
                                value={exp.reason_for_leaving}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, reason_for_leaving: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reference Person</label>
                              <input
                                value={exp.reference_person}
                                onChange={(e) =>
                                  setExperienceList((prev) => prev.map((it, i) => (i === idx ? { ...it, reference_person: e.target.value } : it)))
                                }
                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Reference Phone</label>
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
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Step 5: Mandatory Curriculum Vitae (CV) Upload</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Uploading a valid CV (PDF or DOCX, max 10MB) is strictly mandatory before you can submit your application.
                    </p>
                  </div>

                  <div className="p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-center space-y-3">
                    <FileText className="w-9 h-9 text-sky-600 dark:text-sky-400 mx-auto" />
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {activeCv ? 'Replace Active Curriculum Vitae' : 'Upload Your Curriculum Vitae (Required)'}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Accepted formats: PDF (.pdf) or Microsoft Word (.docx). Maximum size 10 MB.
                    </p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingCv ? `Uploading CV ${cvProgress}%...` : activeCv ? 'Upload Replacement CV' : 'Choose CV File'}</span>
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
                        <div className="font-bold text-emerald-900 dark:text-emerald-200">Active CV Ready: {activeCv.original_filename}</div>
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
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPrivateDocument(activeCv.download_url, activeCv.original_filename)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocument(activeCv.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
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
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Step 6: Skills, Languages & Additional Details</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Highlight your technical, professional, computer, language skills, and availability.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Total Years Experience</label>
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
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Availability</label>
                      <input
                        value={skillsSummaryForm.availability}
                        onChange={(e) => setSkillsSummaryForm({ ...skillsSummaryForm, availability: e.target.value })}
                        placeholder="Immediate / 2 weeks notice"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Preferred Employment</label>
                      <select
                        value={skillsSummaryForm.preferred_employment_type}
                        onChange={(e) => setSkillsSummaryForm({ ...skillsSummaryForm, preferred_employment_type: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="Full-Time">Full-Time</option>
                        <option value="Part-Time">Part-Time</option>
                        <option value="Contract">Contract</option>
                        <option value="Internship">Internship</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Expected Monthly Salary ({vacancy.currency_code || 'RWF'})</label>
                      <input
                        type="number"
                        min="0"
                        value={skillsSummaryForm.expected_salary}
                        onChange={(e) => setSkillsSummaryForm({ ...skillsSummaryForm, expected_salary: e.target.value })}
                        placeholder="Optional"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Skills & Competencies Summary</label>
                    <textarea
                      rows={3}
                      value={skillsSummaryForm.skills_summary}
                      onChange={(e) => setSkillsSummaryForm({ ...skillsSummaryForm, skills_summary: e.target.value })}
                      placeholder="Summarize your technical tools, leadership strengths, and certifications..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>

                  {/* Quick Language Chips */}
                  <div className="space-y-2">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">Quick-Add Languages</div>
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
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                      <select
                        value={skillDraft.skill_category}
                        onChange={(e) => setSkillDraft({ ...skillDraft, skill_category: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="technical">Technical</option>
                        <option value="professional">Professional</option>
                        <option value="computer">Computer / Software</option>
                        <option value="training">Training / Certification</option>
                        <option value="language">Language</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Skill or Language Name</label>
                      <input
                        value={skillDraft.skill_name}
                        onChange={(e) => setSkillDraft({ ...skillDraft, skill_name: e.target.value })}
                        placeholder="e.g. Excel, POS Operations..."
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Proficiency</label>
                      <select
                        value={skillDraft.proficiency_level}
                        onChange={(e) => setSkillDraft({ ...skillDraft, proficiency_level: e.target.value })}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        <option value="Beginner">Beginner / Basic</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                        <option value="Fluent">Fluent / Expert</option>
                        <option value="Native">Native</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => addSkill()}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Skill
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
                            aria-label={`Remove ${s.skill_name}`}
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
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Step 7: Job-Specific Questions & Cover Note</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Tell {vacancy.business_name} why you are a strong fit for <strong>{vacancy.title}</strong>.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        Why do you want this position? *
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
                        Why should we select you for this role? *
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
                        Cover Letter / Additional Statement (Optional)
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
                          {q.label} {q.required ? '*' : '(Optional)'}
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
                    <h2 className="text-base font-bold text-[#0B192C] dark:text-white">Step 8: Review & Submit Your Application</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Review every section carefully. Once submitted, application answers and uploaded files cannot be edited.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">1. Personal Information</span>
                        <button type="button" onClick={() => setStep(1)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">Edit</button>
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">{personalForm.full_name} · {personalForm.phone}</div>
                      <div className="text-slate-500 dark:text-slate-400">{personalForm.email} · {personalForm.district || personalForm.country}</div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">2. Education ({educationList.filter((e) => e.institution_name.trim()).length})</span>
                        <button type="button" onClick={() => setStep(2)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">Edit</button>
                      </div>
                      {educationList.filter((e) => e.institution_name.trim()).map((e, i) => (
                        <div key={i} className="text-slate-600 dark:text-slate-300">
                          {e.education_level} — {e.institution_name} ({e.education_status})
                        </div>
                      ))}
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">3 & 5. CV & Certificates</span>
                        <button type="button" onClick={() => setStep(5)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">Edit</button>
                      </div>
                      <div className={activeCv ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400 font-semibold'}>
                        {activeCv ? `CV Uploaded: ${activeCv.original_filename}` : 'Missing Mandatory CV!'}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        Supporting certificates uploaded: {certificates.length}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">4 & 6. Experience & Skills</span>
                        <button type="button" onClick={() => setStep(4)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">Edit</button>
                      </div>
                      <div className="text-slate-700 dark:text-slate-300">
                        {hasWorkExperience
                          ? `${experienceList.filter((ex) => ex.company_name.trim()).length} experience record(s) · ${skillsSummaryForm.years_of_experience || 0} yr(s)`
                          : 'No prior work experience indicated'}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {skillsList.length} skill/language tag(s) · Availability: {skillsSummaryForm.availability || 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">7. Job-Specific Responses</span>
                      <button type="button" onClick={() => setStep(7)} className="text-sky-700 dark:text-sky-400 font-semibold hover:underline">Edit</button>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 line-clamp-2">
                      <strong>Motivation:</strong> {jobQuestionsForm.why_want_position || 'Not answered yet'}
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 line-clamp-2">
                      <strong>Why select you:</strong> {jobQuestionsForm.why_select_you || 'Not answered yet'}
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
                      I confirm that all information, qualifications, responses, and uploaded documents in this application are truthful, accurate, and complete. I understand that submitting locks edits to this application.
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
                  Back
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => persistDraft()}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Progress'}
                  </button>

                  {step < 8 ? (
                    <button
                      type="button"
                      onClick={() => goToStep(step + 1)}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
                    >
                      {step === 7 ? 'Review Application' : 'Next Step'}
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
                      {submitting ? 'Submitting...' : 'Submit Application'}
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
            <h3 className="text-base font-bold text-[#0B192C] dark:text-white">Discard Draft Application?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              All unsaved or draft progress and temporary files attached to this draft will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelConfirmOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-500"
              >
                Yes, Discard Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
