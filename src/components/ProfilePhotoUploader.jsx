import { useEffect, useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import UserAvatar from './UserAvatar.jsx';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export function validateAvatarFile(file) {
  if (!file) return 'Please select a profile image (JPG, JPEG, PNG, or WEBP).';
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Unsupported file format. Please upload a JPG, JPEG, PNG, or WEBP image.';
  }
  if (file.size > MAX_BYTES) {
    return 'Image file is too large. Maximum allowed size is 5MB.';
  }
  return '';
}

export default function ProfilePhotoUploader({
  title = 'Profile Photo',
  description = 'Upload a clear profile picture (JPG, JPEG, PNG, or WEBP, max 5MB).',
  requiredMode = false,
  onUploaded,
}) {
  const { user, refreshMe } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    setError('');
    setSuccess('');
    const validationError = validateAvatarFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', selectedFile);
      const { data } = await api.post('/auth/avatar', fd);
      setSelectedFile(null);
      setSuccess(data.message || 'Profile image updated successfully.');
      await refreshMe();
      if (onUploaded) onUploaded(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
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
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
              <Upload className="w-3.5 h-3.5" />
              <span>{selectedFile ? 'Choose Another Image' : 'Select Profile Image'}</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            {selectedFile && (
              <button
                type="button"
                disabled={uploading}
                onClick={handleUpload}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60"
              >
                {uploading ? 'Uploading...' : requiredMode ? 'Save Profile Image & Continue' : 'Save Profile Image'}
              </button>
            )}
          </div>

          {selectedFile && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs font-medium text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg">
          {error}
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
