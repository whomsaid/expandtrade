import { useCallback, useEffect, useState } from 'react';
import { Edit2, Eye, EyeOff, Film, Plus, Trash2, Upload } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import VideoAdPlayer from '../../components/VideoAdPlayer.jsx';
import { formatDate } from '../../utils/format.js';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_THUMB_BYTES = 5 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
const ALLOWED_THUMB_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function formatBytes(bytes) {
  const num = Number(bytes || 0);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdvertisementsPage() {
  const { activeBusinessId, token, hasPermission } = useAuth();
  const canManage = hasPermission('ads.manage');

  const [videos, setVideos] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', product_id: '', is_published: false });
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [thumbFile, setThumbFile] = useState(null);
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);

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

  const openCreateModal = () => {
    setEditingVideo(null);
    setForm({ title: '', description: '', product_id: '', is_published: false });
    setVideoFile(null);
    setThumbFile(null);
    setUploadProgress(0);
    setError('');
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
    setUploadProgress(0);
    setError('');
    setModalOpen(true);
  };

  const handleVideoPick = (e) => {
    const file = e.target.files?.[0];
    setError('');
    if (!file) {
      setVideoFile(null);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_VIDEO_TYPES.has(file.type) && !['mp4', 'webm'].includes(ext || '')) {
      setError('Unsupported video format. Please upload an MP4 or WEBM video.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError('Video file exceeds the 50MB maximum limit.');
      e.target.value = '';
      return;
    }
    setVideoFile(file);
  };

  const handleThumbPick = (e) => {
    const file = e.target.files?.[0];
    setError('');
    if (!file) {
      setThumbFile(null);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_THUMB_TYPES.has(file.type) && !['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
      setError('Thumbnail must be a JPG, JPEG, PNG, or WEBP image.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_THUMB_BYTES) {
      setError('Thumbnail image exceeds 5MB.');
      e.target.value = '';
      return;
    }
    setThumbFile(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!editingVideo && !videoFile) {
      setError('Please select an MP4 or WEBM video file to upload.');
      return;
    }

    const fd = new FormData();
    fd.append('title', form.title.trim());
    fd.append('description', form.description.trim());
    if (form.product_id) fd.append('product_id', form.product_id);
    if (!editingVideo) fd.append('is_published', form.is_published ? '1' : '0');
    if (videoFile) fd.append('video', videoFile);
    if (thumbFile) fd.append('thumbnail', thumbFile);

    setSaving(true);
    setUploadProgress(0);
    try {
      const config = {
        onUploadProgress: (evt) => {
          if (evt.total) {
            setUploadProgress(Math.min(100, Math.round((evt.loaded * 100) / evt.total)));
          }
        },
      };
      const res = editingVideo
        ? await api.put(`/ads/videos/${editingVideo.id}`, fd, config)
        : await api.post('/ads/videos', fd, config);
      setMessage(res.data.message);
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleTogglePublish = async (vid) => {
    setError('');
    setMessage('');
    try {
      const { data } = await api.patch(`/ads/videos/${vid.id}/publish`, {
        is_published: !vid.is_published,
      });
      setMessage(data.message);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setError('');
    setMessage('');
    try {
      const { data } = await api.delete(`/ads/videos/${deleteTarget.id}`);
      setMessage(data.message);
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredVideos = videos.filter((v) => {
    if (filter === 'published') return v.is_published;
    if (filter === 'draft') return !v.is_published;
    return true;
  });

  const getAdminStreamUrl = (vid) =>
    `/api/ads/videos/${vid.id}/stream?token=${encodeURIComponent(token)}&businessId=${activeBusinessId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">Business Advertising Videos</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload promotional MP4 or WEBM videos for your products and services, preview before publishing, and feature them on your public business profile.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Upload Video Ad
          </button>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}
      {message && <div className="p-3 text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">{message}</div>}

      <div className="flex items-center gap-2 text-xs">
        {[
          ['all', `All (${videos.length})`],
          ['published', `Published (${videos.filter((v) => v.is_published).length})`],
          ['draft', `Drafts (${videos.filter((v) => !v.is_published).length})`],
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
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">No promotional videos uploaded yet</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Upload short MP4 or WEBM videos showcasing your products or services. You can preview drafts privately before publishing them to customers.
          </p>
          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload First Video Ad
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVideos.map((vid) => (
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
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTarget(vid)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Eye className="w-3 h-3" />
                      Preview
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTogglePublish(vid)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold ${
                        vid.is_published
                          ? 'border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-950'
                          : 'bg-[#0B192C] dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500'
                      }`}
                    >
                      {vid.is_published ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {vid.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(vid)}
                      className="p-1.5 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      aria-label="Delete video advertisement"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload / Edit Modal with Instant Pre-Publish Video Preview */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 my-8 animate-scale-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">
                  {editingVideo ? 'Edit Promotional Video' : 'Upload Promotional Video'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Supported formats: MP4, WEBM (max 50MB). Preview your video before publishing.
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                Close
              </button>
            </div>

            {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Video Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Kigali Fresh Espresso Machine Showcase"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe the promoted product, service, offer, or branch availability..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Related Product / Service</label>
                  <select
                    value={form.product_id}
                    onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">General Business Promotion</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Video File ({editingVideo ? 'Optional replacement' : 'Required · MP4 / WEBM'})
                  </label>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,.mp4,.webm"
                    onChange={handleVideoPick}
                    className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Video Thumbnail Image (Optional · JPG, JPEG, PNG, WEBP, max 5MB)
                </label>
                <div className="flex items-center gap-4">
                  {(thumbPreviewUrl || editingVideo?.thumbnail_url) && (
                    <img
                      src={thumbPreviewUrl || editingVideo.thumbnail_url}
                      alt="Video thumbnail preview"
                      className="w-24 h-14 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  )}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleThumbPick}
                    className="flex-1 px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  />
                </div>
              </div>

              {(videoPreviewUrl || editingVideo) && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">Pre-Publish Video Preview</div>
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
                    checked={form.is_published}
                    onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                  />
                  <span>Publish immediately to public business profile and customer directory</span>
                </label>
              )}

              {saving && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                    <span>Uploading video media...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0B192C] dark:bg-sky-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
                >
                  {saving ? 'Uploading...' : editingVideo ? 'Save Changes' : 'Save Promotional Video'}
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
              <h2 className="text-sm font-bold text-[#0B192C] dark:text-slate-100">Video Preview — {previewTarget.title}</h2>
              <button type="button" onClick={() => setPreviewTarget(null)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                Close
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
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Delete Promotional Video</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete &ldquo;{deleteTarget.title}&rdquo;? Customers will no longer see this advertisement.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-xs border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button type="button" onClick={handleConfirmDelete} className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-600 rounded-lg">
                Delete Video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
