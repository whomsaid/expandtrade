import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';

export function toApiRelativeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/api/')) return raw.slice(4);
  return raw;
}

export async function downloadPrivateDocument(downloadUrl, filename = 'document') {
  const relative = toApiRelativeUrl(downloadUrl);
  if (!relative) return;
  const separator = relative.includes('?') ? '&' : '?';
  const res = await api.get(`${relative}${separator}download=1`, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

export default function PrivateDocumentPreviewModal({ document: doc, onClose }) {
  const { t } = useTranslation();
  const [blobUrl, setBlobUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const mime = String(doc?.mime_type || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdf = mime.includes('pdf');
  const canInlinePreview = isImage || isPdf;

  useEffect(() => {
    if (!doc?.download_url) return undefined;
    let revoked = false;
    let createdUrl = '';

    setLoading(true);
    setError('');
    setBlobUrl('');

    if (!canInlinePreview) {
      setLoading(false);
      return undefined;
    }

    const relative = toApiRelativeUrl(doc.download_url);
    api
      .get(relative, { responseType: 'blob' })
      .then((res) => {
        if (revoked) return;
        const blob = new Blob([res.data], { type: doc.mime_type || 'application/octet-stream' });
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      })
      .catch((err) => {
        if (!revoked) setError(err.message || t('components.unableLoadPreview'));
      })
      .finally(() => {
        if (!revoked) setLoading(false);
      });

    return () => {
      revoked = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [doc, canInlinePreview, t]);

  if (!doc) return null;

  const handleDownload = async () => {
    setError('');
    try {
      await downloadPrivateDocument(doc.download_url, doc.original_filename || doc.document_name || 'document');
    } catch (err) {
      setError(err.message || t('components.downloadFailed'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 dark:bg-black/80 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-up">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {doc.document_name || doc.document_type || t('components.docPreview')}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {doc.original_filename} · {doc.mime_type}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
            >
              <Download className="w-3.5 h-3.5" />
              {t('common.download')}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('components.closeDocPreview')}
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 p-4 flex items-center justify-center min-h-[360px]">
          {error ? (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          ) : loading ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">{t('components.loadingPreview')}</div>
          ) : !canInlinePreview ? (
            <div className="max-w-md text-center space-y-3 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
              <FileText className="w-10 h-10 text-sky-600 dark:text-sky-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('components.docxUnavailable')}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('components.docxUnavailableDesc')}
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500"
              >
                <Download className="w-3.5 h-3.5" />
                {t('common.download')} {doc.original_filename}
              </button>
            </div>
          ) : isImage && blobUrl ? (
            <img
              src={blobUrl}
              alt={doc.original_filename || doc.document_name}
              className="max-w-full max-h-[72vh] object-contain rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            />
          ) : isPdf && blobUrl ? (
            <div className="w-full h-[70vh] flex flex-col gap-2">
              <iframe
                title={doc.original_filename || doc.document_name}
                src={blobUrl}
                className="w-full flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
              />
              <div className="text-right">
                <a
                  href={blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 dark:text-sky-400 hover:underline"
                >
                  {t('components.openPdfTab')}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
