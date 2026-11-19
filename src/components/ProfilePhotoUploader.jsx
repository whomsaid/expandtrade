import { useEffect, useState } from 'react';
import { Camera, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n.js';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { optimizeProfileImage } from '../utils/imageOptimizer.js';
import UserAvatar from './UserAvatar.jsx';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export function validateAvatarFile(file) {
  if (!file) return i18n.t('validation.selectProfileImage');
  if (file.size === 0) return i18n.t('validation.emptyFile');
  const ext = file.name?.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXT.has(ext)) {
    return i18n.t('validation.unsupportedImageFormat');
  }
  if (file.size > MAX_BYTES) {
    return i18n.t('validation.imageTooLarge');
  }
  return '';
}

export default function ProfilePhotoUploader({
  title,
  description,
  requiredMode = false,
  onUploaded,
}) {
  const { t } = useTranslation();
  const { user, refreshMe } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const resolvedTitle = title || t('components.profilePhoto');
  const resolvedDesc = description || t('components.profilePhotoDesc');

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setError('');
    setSuccess('');
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async (e) => {
    e?.preventDefault();
    if (uploading || removing) return;
    setError('');
    setSuccess('');
    const validationError = validateAvatarFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const optimized = await optimizeProfileImage(selectedFile, 512, 0.85);
      const fd = new FormData();
      fd.append('avatar', optimized);
      const { data } = await api.post('/auth/avatar', fd, {
        timeout: 0,
        onUploadProgress: (evt) => {
          if (evt.total) {
            setUploadProgress(Math.min(100, Math.round((evt.loaded * 100) / evt.total)));
          }
        },
      });
      setSelectedFile(null);
      setSuccess(t('components.profileImageUpdated'));
      await refreshMe();
      if (onUploaded) onUploaded(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemove = async () => {
    if (removing || uploading) return;
    setError('');
    setSuccess('');
    setRemoving(true);
    try {
      const { data } = await api.delete('/auth/avatar');
      setSelectedFile(null);
      setPreviewUrl('');
      setSuccess(t('components.profileImageRemoved'));
      await refreshMe();
      if (onUploaded) onUploaded(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative shrink-0">
          <UserAvatar
            src={previewUrl || user?.avatar_url}
            name={user?.full_name}
            size="xl"
            className="border-2 border-slate-200 dark:border-slate-700"
          />
          <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#0B192C] dark:bg-sky-600 text-white flex items-center justify-center border-2 border-white dark:border-slate-900">
            <Camera className="w-3.5 h-3.5" />
          </span>
        </div>

        <div className="space-y-2 flex-1 min-w-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{resolvedTitle}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{resolvedDesc}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
              <Upload className="w-3.5 h-3.5" />
              <span>
                {selectedFile
                  ? t('components.chooseAnotherImage')
                  : user?.avatar_url
                    ? t('components.changeProfilePhoto')
                    : t('components.uploadProfilePhoto')}
              </span>
              <input
                type="file"
                disabled={uploading || removing}
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            {selectedFile && (
              <button
                type="button"
                disabled={uploading || removing}
                onClick={handleUpload}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
              >
                {uploading
                  ? t('components.optimizingUploading')
                  : requiredMode
                    ? t('components.savePhotoContinue')
                    : t('components.savePhoto')}
              </button>
            )}

            {user?.avatar_url && !requiredMode && (
              <button
                type="button"
                disabled={removing || uploading}
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{removing ? t('components.removing') : t('components.removePhoto')}</span>
              </button>
            )}
          </div>

          {uploading && uploadProgress > 0 && (
            <div className="w-full max-w-xs h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-sky-600 transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}

          {selectedFile && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {t('components.selectedFile')}: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center justify-between gap-2">
          <span>{error}</span>
          {selectedFile && !uploading && (
            <button
              type="button"
              onClick={handleUpload}
              className="px-2.5 py-1 font-semibold bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 rounded hover:bg-rose-100 shrink-0"
            >
              {t('common.retry')}
            </button>
          )}
        </div>
      )}
      {success && (
        <div className="p-3 text-xs font-medium text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          {success}
        </div>
      )}
    </div>
  );
}
