import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Edit2, Eye, EyeOff, Film, Loader2, Plus, RefreshCw, Trash2, Upload, XCircle } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import VideoAdPlayer from '../../components/VideoAdPlayer.jsx';
import { formatDate } from '../../utils/format.js';
import { useExpandableList } from '../../utils/listOrder.js';
import ViewMoreFooter from '../../components/ViewMoreFooter.jsx';

const MAX_VIDEO_BYTES = 250 * 1024 * 1024; // 250MB storage/file-size cap (NO time limit)
const MAX_THUMB_BYTES = 5 * 1024 * 1024;
const CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2MB resumable chunks
const MAX_CHUNK_RETRIES = 3;
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
const ALLOWED_THUMB_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function formatBytes(bytes) {
  const num = Number(bytes || 0);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function getStorageKey(businessId) {
  return `biztrade_active_video_upload_${businessId}`;
}

export default function AdvertisementsPage() {
  const { t } = useTranslation();
  const { activeBusinessId, token, socket, hasPermission } = useAuth();
  const canManage = hasPermission('ads.manage');

  const [videos, setVideos] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalError, setModalError] = useState('');
  const [editingVideo, setEditingVideo] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', product_id: '', is_published: false });
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [thumbFile, setThumbFile] = useState(null);
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState('');

  // Resumable chunk upload & background job state
  const [uploadStage, setUploadStage] = useState('idle'); // idle | uploading | processing | saving | completed | failed | cancelled
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [activeUploadId, setActiveUploadId] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const [resumableSession, setResumableSession] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [togglingId, setTogglingId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const uploadAbortRef = useRef(null);
  const cancelledFlagRef = useRef(false);

  const [previewTarget, setPreviewTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadData = useCallback(async () => {
    if (!activeBusinessId) return;
    setLoading(true);
    setError('');
    try {
      const [vRes, pRes] = await Promise.all([api.get('/ads/videos'), api.get('/products')]);
      setVideos(vRes.data.videos || []);
      setProducts(pRes.data.products || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const clearSavedUploadSession = useCallback(() => {
    if (!activeBusinessId) return;
    try {
      localStorage.removeItem(getStorageKey(activeBusinessId));
    } catch {
      // ignore storage quota errors
    }
    setResumableSession(null);
  }, [activeBusinessId]);

  const watchFinalizationJob = useCallback(
    async (jobId) => {
      setActiveJobId(jobId);
      setUploadStage('processing');
      while (!cancelledFlagRef.current) {
        try {
          const { data } = await api.get(`/jobs/${jobId}`, { skipRetry: true });
          const job = data.job;
          if (!job) throw new Error(t('ads.jobNotFoundErr'));

          if (job.stage_label === 'saving') {
            setUploadStage('saving');
          } else if (job.status === 'processing' || job.status === 'queued') {
            setUploadStage('processing');
          }
          if (typeof job.progress === 'number') {
            setUploadProgress(Math.max(10, Math.min(100, job.progress)));
          }

          if (job.status === 'completed') {
            setUploadStage('completed');
            setUploadProgress(100);
            clearSavedUploadSession();
            setMessage(job.result?.message || t('ads.completedSuccess'));
            setModalOpen(false);
            setActiveUploadId(null);
            setActiveJobId(null);
            await loadData();
            return job.result;
          }

          if (job.status === 'failed' || job.status === 'cancelled') {
            throw new Error(job.error_message || t('ads.jobFailedErr'));
          }
        } catch (err) {
          if (err.status === 404 || !err.isTimeout) {
            throw err;
          }
        }
        await new Promise((r) => setTimeout(r, 900));
      }
      return null;
    },
    [clearSavedUploadSession, loadData, t]
  );

  // Restore interrupted or in-progress upload session after page refresh
  useEffect(() => {
    if (!activeBusinessId || !canManage) return;
    let raw = null;
    try {
      raw = localStorage.getItem(getStorageKey(activeBusinessId));
    } catch {
      raw = null;
    }
    if (!raw) {
      setResumableSession(null);
      return;
    }
    let savedMeta = null;
    try {
      savedMeta = JSON.parse(raw);
    } catch {
      clearSavedUploadSession();
      return;
    }
    if (!savedMeta?.uploadId) {
      clearSavedUploadSession();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/ads/videos/uploads/${savedMeta.uploadId}`);
        if (cancelled) return;
        if (data.status === 'completed' || data.status === 'cancelled') {
          clearSavedUploadSession();
          return;
        }
        if (data.status === 'processing' && data.jobId) {
          setActiveUploadId(data.uploadId);
          setTotalBytes(data.totalSizeBytes);
          setUploadedBytes(data.totalSizeBytes);
          setSaving(true);
          try {
            await watchFinalizationJob(data.jobId);
          } catch (err) {
            setError(err.message);
            setUploadStage('failed');
          } finally {
            setSaving(false);
          }
          return;
        }
        setResumableSession({
          ...savedMeta,
          ...data,
        });
      } catch {
        if (!cancelled) clearSavedUploadSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBusinessId, canManage, clearSavedUploadSession, watchFinalizationJob]);

  // Listen to real-time Socket.IO job progress updates
  useEffect(() => {
    if (!socket || !activeJobId) return;
    const onProgress = (job) => {
      if (!job || job.id !== activeJobId) return;
      if (job.stage_label === 'saving') setUploadStage('saving');
      if (typeof job.progress === 'number') setUploadProgress(Math.min(100, job.progress));
    };
    socket.on('job:progress', onProgress);
    return () => socket.off('job:progress', onProgress);
  }, [socket, activeJobId]);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  useEffect(() => {
    if (!thumbFile) {
      setThumbPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(thumbFile);
    setThumbPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbFile]);

  const resetUploadState = () => {
    setUploadStage('idle');
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setActiveUploadId(null);
    setActiveJobId(null);
    setModalError('');
  };

  const openCreateModal = () => {
    setEditingVideo(null);
    setForm({ title: '', description: '', product_id: '', is_published: false });
    setVideoFile(null);
    setThumbFile(null);
    resetUploadState();
    setModalOpen(true);
  };

  const openEditModal = (vid) => {
    setEditingVideo(vid);
    setForm({
      title: vid.title || '',
      description: vid.description || '',
      product_id: vid.product_id ? String(vid.product_id) : '',
      is_published: Boolean(vid.is_published),
    });
    setVideoFile(null);
    setThumbFile(null);
    resetUploadState();
    setModalOpen(true);
  };

  const openResumeModal = () => {
    if (!resumableSession) return;
    const targetEdit = resumableSession.editingVideoId
      ? videos.find((v) => v.id === Number(resumableSession.editingVideoId)) || null
      : null;
    setEditingVideo(targetEdit);
    setForm({
      title: resumableSession.title || '',
      description: resumableSession.description || '',
      product_id: resumableSession.productId ? String(resumableSession.productId) : '',
      is_published: Boolean(resumableSession.is_published),
    });
    setActiveUploadId(resumableSession.uploadId);
    setUploadedBytes(resumableSession.uploadedBytes || 0);
    setTotalBytes(resumableSession.totalSizeBytes || 0);
    const pct = resumableSession.totalSizeBytes
      ? Math.round(((resumableSession.uploadedBytes || 0) * 100) / resumableSession.totalSizeBytes)
      : 0;
    setUploadProgress(pct);
    setUploadStage('idle');
    setModalError('');
    setModalOpen(true);
  };

  const handleDiscardResumable = async () => {
    if (!resumableSession?.uploadId) {
      clearSavedUploadSession();
      return;
    }
    try {
      await api.delete(`/ads/videos/uploads/${resumableSession.uploadId}`);
    } catch {
      // ignore if already gone
    }
    clearSavedUploadSession();
  };

  const handleCancelActiveUpload = async () => {
    if (cancelling) return;
    cancelledFlagRef.current = true;
    setCancelling(true);
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort();
      uploadAbortRef.current = null;
    }
    const idToCancel = activeUploadId;
    if (idToCancel) {
      try {
        await api.delete(`/ads/videos/uploads/${idToCancel}`);
      } catch {
        // ignore network errors on cleanup
      }
      clearSavedUploadSession();
    }
    setSaving(false);
    setCancelling(false);
    setUploadStage('cancelled');
    setActiveUploadId(null);
    setActiveJobId(null);
    setUploadProgress(0);
    setUploadedBytes(0);
    setModalError(t('ads.uploadCancelledMsg'));
  };

  const closeModal = () => {
    if (saving) {
      // Abort active HTTP transfer cleanly but keep server upload session resumable!
      cancelledFlagRef.current = true;
      if (uploadAbortRef.current) {
        uploadAbortRef.current.abort();
        uploadAbortRef.current = null;
      }
      setSaving(false);
    }
    setModalOpen(false);
    setModalError('');
  };

  const handleVideoPick = (e) => {
    const file = e.target.files?.[0];
    setModalError('');
    if (!file) {
      setVideoFile(null);
      return;
    }
    if (file.size === 0) {
      setModalError(t('validation.emptyFile'));
      e.target.value = '';
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_VIDEO_TYPES.has(file.type) && !['mp4', 'webm'].includes(ext || '')) {
      setModalError(t('ads.errFormat'));
      e.target.value = '';
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setModalError(t('ads.errVideoSize'));
      e.target.value = '';
      return;
    }

    // Check if selecting a file breaks an unrelated resumable session
    if (
      activeUploadId &&
      resumableSession &&
      (resumableSession.filename !== file.name || Number(resumableSession.totalSizeBytes) !== file.size)
    ) {
      setActiveUploadId(null);
    }
    setVideoFile(file);
    setTotalBytes(file.size);
  };

  const handleThumbPick = (e) => {
    const file = e.target.files?.[0];
    setModalError('');
    if (!file) {
      setThumbFile(null);
      return;
    }
    if (file.size === 0) {
      setModalError(t('validation.emptyFile'));
      e.target.value = '';
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_THUMB_TYPES.has(file.type) && !['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
      setModalError(t('ads.errThumbFormat'));
      e.target.value = '';
      return;
    }
    if (file.size > MAX_THUMB_BYTES) {
      setModalError(t('ads.errThumbSize'));
      e.target.value = '';
      return;
    }
    setThumbFile(file);
  };

  const uploadSingleChunkWithRetry = async (uploadId, chunkIndex, chunkBlob, controller, baseUploadedBytes, fileSize) => {
    let attempt = 0;
    while (attempt < MAX_CHUNK_RETRIES) {
      if (cancelledFlagRef.current || controller.signal.aborted) {
        const canceledErr = new Error('Upload cancelled');
        canceledErr.isCanceled = true;
        throw canceledErr;
      }
      const fd = new FormData();
      fd.append('chunk', chunkBlob, `chunk_${chunkIndex}.part`);
      try {
        const { data } = await api.put(`/ads/videos/uploads/${uploadId}/chunk/${chunkIndex}`, fd, {
          timeout: 0,
          noTimeout: true,
          signal: controller.signal,
          onUploadProgress: (evt) => {
            if (!evt.total) return;
            const currentBytes = Math.min(fileSize, baseUploadedBytes + evt.loaded);
            setUploadedBytes(currentBytes);
            setUploadProgress(Math.min(99, Math.round((currentBytes * 100) / fileSize)));
          },
        });
        return data;
      } catch (err) {
        if (err.isCanceled || cancelledFlagRef.current) throw err;
        attempt += 1;
        // Do not retry non-recoverable 4xx client validation errors (except 408/429)
        if (err.status && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
          throw err;
        }
        if (attempt >= MAX_CHUNK_RETRIES) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    throw new Error(t('ads.chunkRetryFailed'));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setMessage('');

    if (!editingVideo && !videoFile) {
      setModalError(
        resumableSession && activeUploadId
          ? t('ads.reselectToResume', { name: resumableSession.filename, size: formatBytes(resumableSession.totalSizeBytes) })
          : t('ads.errMissingVideo')
      );
      return;
    }

    const controller = new AbortController();
    uploadAbortRef.current = controller;
    cancelledFlagRef.current = false;
    setSaving(true);

    try {
      // Metadata/thumbnail-only update when editing without replacing video file
      if (editingVideo && !videoFile) {
        setUploadStage('saving');
        setUploadProgress(50);
        const fd = new FormData();
        fd.append('title', form.title.trim());
        fd.append('description', form.description.trim());
        if (form.product_id) fd.append('product_id', form.product_id);
        if (thumbFile) fd.append('thumbnail', thumbFile);

        const res = await api.put(`/ads/videos/${editingVideo.id}`, fd, {
          timeout: 0,
          signal: controller.signal,
        });
        setUploadStage('completed');
        setUploadProgress(100);
        setMessage(res.data.message);
        setModalOpen(false);
        await loadData();
        return;
      }

      // Resumable chunked video upload flow (NO arbitrary timeout)
      const file = videoFile;
      setTotalBytes(file.size);
      setUploadStage('uploading');

      let sessionUploadId = activeUploadId;
      let chunkSize = CHUNK_SIZE_BYTES;
      let totalChunks = Math.ceil(file.size / CHUNK_SIZE_BYTES);
      let completedChunkSet = new Set();
      let currentUploadedBytes = 0;

      // Verify existing resumable session if matching same file
      if (sessionUploadId) {
        try {
          const { data: state } = await api.get(`/ads/videos/uploads/${sessionUploadId}`);
          if (
            state.status === 'uploading' &&
            Number(state.totalSizeBytes) === file.size &&
            state.filename === file.name
          ) {
            chunkSize = Number(state.chunkSize) || CHUNK_SIZE_BYTES;
            totalChunks = Number(state.totalChunks) || Math.ceil(file.size / chunkSize);
            completedChunkSet = new Set(state.uploadedChunks || []);
            currentUploadedBytes = Number(state.uploadedBytes || 0);
            setUploadedBytes(currentUploadedBytes);
            setUploadProgress(Math.min(99, Math.round((currentUploadedBytes * 100) / file.size)));
          } else if (state.status === 'processing' && state.jobId) {
            await watchFinalizationJob(state.jobId);
            return;
          } else {
            sessionUploadId = null;
          }
        } catch {
          sessionUploadId = null;
        }
      }

      // Initialize new upload session if none active
      if (!sessionUploadId) {
        const initFd = new FormData();
        initFd.append('title', form.title.trim());
        initFd.append('description', form.description.trim());
        if (form.product_id) initFd.append('product_id', form.product_id);
        if (editingVideo?.id) initFd.append('editing_video_id', String(editingVideo.id));
        initFd.append('is_published', form.is_published ? '1' : '0');
        initFd.append('filename', file.name);
        initFd.append('mimetype', file.type || (file.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4'));
        initFd.append('total_size_bytes', String(file.size));
        initFd.append('chunk_size_bytes', String(CHUNK_SIZE_BYTES));
        if (thumbFile) initFd.append('thumbnail', thumbFile);

        const { data: initData } = await api.post('/ads/videos/uploads/init', initFd, {
          timeout: 0,
          signal: controller.signal,
        });
        sessionUploadId = initData.uploadId;
        chunkSize = Number(initData.chunkSize);
        totalChunks = Number(initData.totalChunks);
        setActiveUploadId(sessionUploadId);

        const sessionMeta = {
          uploadId: sessionUploadId,
          businessId: activeBusinessId,
          title: form.title.trim(),
          description: form.description.trim(),
          productId: form.product_id || null,
          editingVideoId: editingVideo?.id || null,
          is_published: Boolean(form.is_published),
          filename: file.name,
          totalSizeBytes: file.size,
          chunkSize,
          totalChunks,
          uploadedChunks: [],
          uploadedBytes: 0,
        };
        setResumableSession(sessionMeta);
        try {
          localStorage.setItem(getStorageKey(activeBusinessId), JSON.stringify(sessionMeta));
        } catch {
          // ignore localStorage errors
        }
      }

      // Sequentially upload missing chunks without time limits
      for (let i = 0; i < totalChunks; i += 1) {
        if (completedChunkSet.has(i)) continue;
        const start = i * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const blob = file.slice(start, end);

        const chunkAck = await uploadSingleChunkWithRetry(
          sessionUploadId,
          i,
          blob,
          controller,
          currentUploadedBytes,
          file.size
        );
        completedChunkSet = new Set(chunkAck.uploadedChunks || []);
        currentUploadedBytes = Number(chunkAck.uploadedBytes || end);
        setUploadedBytes(currentUploadedBytes);
        setUploadProgress(Math.min(99, Math.round((currentUploadedBytes * 100) / file.size)));
      }

      // All chunks uploaded -> trigger server assembly, format verification & MySQL/SQLite persistence
      setUploadStage('processing');
      const { data: completeData } = await api.post(`/ads/videos/uploads/${sessionUploadId}/complete`, undefined, {
        noTimeout: true,
        signal: controller.signal,
      });

      if (completeData.jobId) {
        await watchFinalizationJob(completeData.jobId);
      } else {
        setUploadStage('completed');
        clearSavedUploadSession();
        setModalOpen(false);
        await loadData();
      }
    } catch (err) {
      if (err.isCanceled || cancelledFlagRef.current) {
        return;
      }
      setUploadStage('failed');
      setModalError(err.message);
    } finally {
      uploadAbortRef.current = null;
      setSaving(false);
    }
  };

  const handleTogglePublish = async (vid) => {
    if (togglingId) return;
    setError('');
    setMessage('');
    setTogglingId(vid.id);
    try {
      const { data } = await api.patch(`/ads/videos/${vid.id}/publish`, {
        is_published: !vid.is_published,
      });
      setMessage(data.message);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setError('');
    setMessage('');
    setDeleting(true);
    try {
      const { data } = await api.delete(`/ads/videos/${deleteTarget.id}`);
      setMessage(data.message);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredVideos = videos.filter((v) => {
    if (filter === 'published') return v.is_published;
    if (filter === 'draft') return !v.is_published;
    return true;
  });
  const videosBox = useExpandableList(filteredVideos, { initialLimit: 6, sortNewest: true });

  const getAdminStreamUrl = (vid) =>
    `/api/ads/videos/${vid.id}/stream?token=${encodeURIComponent(token)}&businessId=${activeBusinessId}`;

  const getStageText = () => {
    if (uploadStage === 'uploading') return t('ads.statusUploading');
    if (uploadStage === 'processing') return t('ads.statusProcessing');
    if (uploadStage === 'saving') return t('ads.statusSaving');
    if (uploadStage === 'completed') return t('ads.statusCompleted');
    if (uploadStage === 'failed') return t('ads.statusFailed');
    if (uploadStage === 'cancelled') return t('ads.statusCancelled');
    return t('ads.uploadingProgress');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('ads.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('ads.subtitle')}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            data-shortcut-new="true"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('ads.uploadVideoAd')}
          </button>
        )}
      </div>

      {resumableSession && !modalOpen && canManage && (
        <div className="p-3.5 text-xs bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5 text-amber-950 dark:text-amber-200">
            <div className="font-semibold">{t('ads.resumeBannerTitle')}</div>
            <div className="text-amber-800 dark:text-amber-300 tabular-nums">
              {resumableSession.filename} · {formatBytes(resumableSession.uploadedBytes)} / {formatBytes(resumableSession.totalSizeBytes)}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openResumeModal}
              className="px-3 py-1.5 font-semibold bg-[#0B192C] dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
            >
              {t('ads.resumeUploadBtn')}
            </button>
            <button
              type="button"
              onClick={handleDiscardResumable}
              className="px-3 py-1.5 font-medium border border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              {t('ads.discardUploadBtn')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadData}
            className="px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      {message && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">{message}</div>}

      <div className="flex items-center gap-2 text-xs">
        {[
          ['all', t('ads.filterAll', { count: videos.length })],
          ['published', t('ads.filterPublished', { count: videos.filter((v) => v.is_published).length })],
          ['draft', t('ads.filterDraft', { count: videos.filter((v) => !v.is_published).length })],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              filter === key
                ? 'bg-[#0B192C] dark:bg-sky-600 text-white border-[#0B192C] dark:border-sky-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-64 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <Film className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('ads.emptyTitle')}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {t('ads.emptySubtitle')}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
            >
              <Upload className="w-3.5 h-3.5" />
              {t('ads.uploadFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videosBox.visibleItems.map((vid) => (
              <div key={vid.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between">
                <div>
                  <VideoAdPlayer video={vid} streamSrc={getAdminStreamUrl(vid)} compact />
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <StatusBadge status={vid.is_published ? 'active' : 'pending'} />
                    <span className="tabular-nums">
                      {formatBytes(vid.file_size_bytes)} · {formatDate(vid.created_at)}
                    </span>
                  </div>
                </div>

                {canManage && (
                  <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(vid)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Edit2 className="w-3 h-3" />
                        {t('ads.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTarget(vid)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Eye className="w-3 h-3" />
                        {t('ads.preview')}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={togglingId === vid.id}
                        onClick={() => handleTogglePublish(vid)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold disabled:opacity-60 ${
                          vid.is_published
                            ? 'border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-950'
                            : 'bg-[#0B192C] dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500'
                        }`}
                      >
                        {vid.is_published ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {vid.is_published ? t('ads.unpublish') : t('ads.publish')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(vid)}
                        className="p-1.5 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/50"
                        aria-label={t('ads.deleteAria')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <ViewMoreFooter
            totalCount={videosBox.totalCount}
            visibleCount={videosBox.visibleCount}
            initialLimit={6}
            expanded={videosBox.expanded}
            onToggle={videosBox.toggleExpanded}
            className="rounded-xl border border-slate-200 dark:border-slate-800"
          />
        </div>
      )}

      {/* Upload / Edit Modal with Instant Pre-Publish Video Preview & Resumable Chunk Progress */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 my-8 animate-scale-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">
                  {editingVideo ? t('ads.editModalTitle') : t('ads.uploadModalTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('ads.modalFormatsHint')}
                </p>
              </div>
              <button type="button" onClick={closeModal} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                {t('common.close')}
              </button>
            </div>

            {modalError && (
              <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center justify-between gap-2">
                <span>{modalError}</span>
                <button
                  type="submit"
                  form="ad-video-form"
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0B192C] dark:bg-sky-600 text-white font-semibold hover:bg-slate-800 dark:hover:bg-sky-500 shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  {t('common.retry')}
                </button>
              </div>
            )}

            <form id="ad-video-form" onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('ads.videoTitleLabel')}</label>
                <input
                  required
                  disabled={saving}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={t('ads.videoTitlePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('ads.descriptionLabel')}</label>
                <textarea
                  rows={2}
                  disabled={saving}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={t('ads.descriptionPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('ads.relatedProductLabel')}</label>
                  <select
                    disabled={saving}
                    value={form.product_id}
                    onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60"
                  >
                    <option value="">{t('ads.generalPromotion')}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('ads.videoFileLabel', { req: editingVideo ? t('ads.videoFileOptional') : t('ads.videoFileRequired') })}
                  </label>
                  <input
                    type="file"
                    disabled={saving}
                    accept="video/mp4,video/webm,.mp4,.webm"
                    onChange={handleVideoPick}
                    className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('ads.thumbLabel')}
                </label>
                <div className="flex items-center gap-4">
                  {(thumbPreviewUrl || editingVideo?.thumbnail_url) && (
                    <img
                      src={thumbPreviewUrl || editingVideo.thumbnail_url}
                      alt={t('ads.thumbAlt')}
                      className="w-24 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  )}
                  <input
                    type="file"
                    disabled={saving}
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleThumbPick}
                    className="flex-1 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-60"
                  />
                </div>
              </div>

              {(videoPreviewUrl || editingVideo) && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">{t('ads.prePublishPreview')}</div>
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video max-h-60">
                    <video
                      src={videoPreviewUrl || getAdminStreamUrl(editingVideo)}
                      poster={thumbPreviewUrl || editingVideo?.thumbnail_url || undefined}
                      controls
                      preload="metadata"
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              {!editingVideo && (
                <label className="flex items-center gap-2 pt-1 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    disabled={saving}
                    checked={form.is_published}
                    onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                  />
                  <span>{t('ads.publishImmediately')}</span>
                </label>
              )}

              {(saving || uploadStage !== 'idle') && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      {uploadStage === 'completed' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : uploadStage === 'failed' || uploadStage === 'cancelled' ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      ) : (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                      )}
                      <span>{getStageText()}</span>
                    </span>
                    <span>
                      {totalBytes > 0 ? `${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)} · ` : ''}
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${
                        uploadStage === 'failed' || uploadStage === 'cancelled'
                          ? 'bg-rose-600'
                          : uploadStage === 'completed'
                            ? 'bg-emerald-600'
                            : 'bg-[#0B192C] dark:bg-sky-500'
                      }`}
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {saving && activeUploadId ? (
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={handleCancelActiveUpload}
                    className="px-4 py-2 font-semibold text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/50 disabled:opacity-60"
                  >
                    {cancelling ? t('common.loadingData') : t('ads.cancelUploadBtn')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {t('common.cancel')}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
                >
                  {saving
                    ? getStageText()
                    : uploadStage === 'failed' && activeUploadId
                      ? t('ads.resumeUploadBtn')
                      : editingVideo
                        ? t('ads.saveChanges')
                        : t('ads.savePromoVideo')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Preview Modal */}
      {previewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100">{t('ads.previewModalTitle', { title: previewTarget.title })}</h2>
              <button type="button" onClick={() => setPreviewTarget(null)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                {t('common.close')}
              </button>
            </div>
            <VideoAdPlayer video={previewTarget} streamSrc={getAdminStreamUrl(previewTarget)} />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('ads.deleteModalTitle')}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t('ads.deleteConfirm', { title: deleteTarget.title })}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-xs border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                {t('common.cancel')}
              </button>
              <button type="button" disabled={deleting} onClick={handleConfirmDelete} className="px-4 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg disabled:opacity-60">
                {deleting ? t('common.loadingData') : t('ads.deleteVideo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
