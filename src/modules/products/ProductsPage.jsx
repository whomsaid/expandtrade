import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Package, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { formatMoney } from '../../utils/format.js';

export default function ProductsPage() {
  const { t } = useTranslation();
  const { activeBusinessId, activeBranchId, workspace, hasPermission } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingCat, setCreatingCat] = useState(false);
  const [archivingId, setArchivingId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [imagePreview, setImagePreview] = useState('');
  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    category_id: '',
    supplier_id: '',
    description: '',
    unit: 'pcs',
    purchase_price: '',
    selling_price: '',
    quantity: '0',
    min_stock: '5',
    image: null,
  });

  const currency = workspace?.business?.currency_code || 'RWF';

  const loadData = useCallback(async () => {
    if (!activeBusinessId) return;
    setLoading(true);
    try {
      const [prodRes, catRes, supRes] = await Promise.all([
        api.get('/products', { params: { search, category_id: categoryFilter } }),
        api.get('/categories'),
        hasPermission('suppliers.view') ? api.get('/suppliers') : Promise.resolve({ data: { suppliers: [] } }),
      ]);
      setProducts(prodRes.data.products || []);
      setCategories(catRes.data.categories || []);
      setSuppliers(supRes.data.suppliers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeBusinessId, activeBranchId, search, categoryFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const openCreate = () => {
    setEditing(null);
    setModalError('');
    setUploadProgress(0);
    setImagePreview('');
    setForm({
      name: '',
      sku: `SKU-${Date.now().toString().slice(-5)}`,
      barcode: '',
      category_id: categories[0]?.id || '',
      supplier_id: '',
      description: '',
      unit: 'pcs',
      purchase_price: '',
      selling_price: '',
      quantity: '0',
      min_stock: '5',
      image: null,
    });
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setModalError('');
    setUploadProgress(0);
    setImagePreview(p.image_url || '');
    setForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      category_id: p.category_id || '',
      supplier_id: p.supplier_id || '',
      description: p.description || '',
      unit: p.unit || 'pcs',
      purchase_price: String(p.purchase_price),
      selling_price: String(p.selling_price),
      quantity: String(p.quantity || 0),
      min_stock: String(p.min_stock || 5),
      image: null,
    });
    setShowModal(true);
  };

  const handleImageSelect = (file) => {
    setModalError('');
    if (!file) {
      setForm((prev) => ({ ...prev, image: null }));
      setImagePreview(editing?.image_url || '');
      return;
    }
    if (file.size === 0) {
      setModalError(t('validation.emptyFile'));
      return;
    }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isGenericMime = !file.type || file.type === 'application/octet-stream';
    if (!allowed.includes(file.type) && !(isGenericMime && ['jpg', 'jpeg', 'png', 'webp'].includes(ext))) {
      setModalError(t('validation.unsupportedImageFormat'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setModalError(t('validation.imageTooLarge'));
      return;
    }
    setForm((prev) => ({ ...prev, image: file }));
    setImagePreview((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'image' && v) fd.append('image', v);
        else if (k !== 'image' && v !== null && v !== undefined) fd.append(k, v);
      });

      const uploadConfig = {
        onUploadProgress: (evt) => {
          if (evt.total && form.image) {
            setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        },
      };

      if (editing) {
        await api.put(`/products/${editing.id}`, fd, uploadConfig);
      } else {
        await api.post('/products', fd, uploadConfig);
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim() || creatingCat) return;
    setCreatingCat(true);
    setError('');
    try {
      await api.post('/categories', { name: newCategoryName.trim() });
      setNewCategoryName('');
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingCat(false);
    }
  };

  const handleArchive = async (id) => {
    if (archivingId === id) return;
    setArchivingId(id);
    setError('');
    try {
      await api.delete(`/products/${id}`);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setArchivingId(null);
    }
  };

  const handleExportCsv = async () => {
    setError('');
    try {
      const res = await api.get('/products/export/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'biztrade-products.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('products.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('products.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {t('products.exportCsv')}
          </button>
          {hasPermission('products.create') && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('products.addProduct')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
          {error}
        </div>
      )}

      {/* Filters + Quick Category Add */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('products.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          >
            <option value="">{t('products.allCategories')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {hasPermission('products.create') && (
          <form onSubmit={handleCreateCategory} className="flex items-center gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder={t('products.newCatPlaceholder')}
              className="px-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <button type="submit" disabled={creatingCat} className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-50">
              {creatingCat ? t('common.saving') : t('products.addCategory')}
            </button>
          </form>
        )}
      </div>

      {/* Product Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              <th className="py-3 px-4 font-semibold">{t('products.colProduct')}</th>
              <th className="py-3 px-4 font-semibold">{t('products.colSkuBarcode')}</th>
              <th className="py-3 px-4 font-semibold">{t('products.colCategory')}</th>
              <th className="py-3 px-4 font-semibold text-right">{t('products.colPurchase')}</th>
              <th className="py-3 px-4 font-semibold text-right">{t('products.colSelling')}</th>
              <th className="py-3 px-4 font-semibold text-right">{t('products.colBranchStock')}</th>
              <th className="py-3 px-4 font-semibold">{t('products.colStatus')}</th>
              <th className="py-3 px-4 font-semibold text-right">{t('products.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 dark:text-slate-500">{t('products.loading')}</td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500 dark:text-slate-400">
                  {t('products.empty')}
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{p.unit}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                    <div>{p.sku}</div>
                    {p.barcode && <div className="text-[11px] text-slate-400 dark:text-slate-500">{p.barcode}</div>}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{p.category_name || '—'}</td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatMoney(p.purchase_price, currency)}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatMoney(p.selling_price, currency)}</td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    <span className={p.quantity <= 0 ? 'text-rose-700 dark:text-rose-400 font-bold' : p.quantity <= p.min_stock ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-slate-900 dark:text-slate-100'}>
                      {p.quantity}
                    </span>
                  </td>
                  <td className="py-3 px-4"><StatusBadge status={p.status} /></td>
                  <td className="py-3 px-4 text-right space-x-2">
                    {hasPermission('products.update') && (
                      <button type="button" onClick={() => openEdit(p)} className="text-sky-700 dark:text-sky-400 hover:underline font-medium">
                        {t('products.edit')}
                      </button>
                    )}
                    {hasPermission('products.delete') && (
                      <button type="button" disabled={archivingId === p.id} onClick={() => handleArchive(p.id)} className="text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center disabled:opacity-40">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-scale-in">
            <h2 className="text-lg font-bold text-[#0B192C] dark:text-slate-100">{editing ? t('products.editModalTitle') : t('products.createModalTitle')}</h2>
            {modalError && (
              <div className="p-2.5 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">
                {modalError}
              </div>
            )}
            <form onSubmit={handleSaveProduct} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('products.productName')}</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('products.sku')}</label>
                  <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('products.barcode')}</label>
                  <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('products.category')}</label>
                  <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    <option value="">{t('products.none')}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('products.supplier')}</label>
                  <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                    <option value="">{t('products.none')}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('products.purchasePrice')}</label>
                  <input type="number" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('products.sellingPrice')}</label>
                  <input required type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
                {!editing && (
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('products.openingQty')}</label>
                    <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                  </div>
                )}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('products.minStock')}</label>
                  <input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">{t('products.productImage')}</label>
                <div className="flex items-center gap-3">
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt={form.name || t('products.productImage')}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  )}
                  <label className="flex-1 flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Upload className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span className="text-slate-600 dark:text-slate-300 truncate">{form.image ? form.image.name : t('products.chooseImage')}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        handleImageSelect(e.target.files?.[0] || null);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                {saving && form.image && uploadProgress > 0 && (
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-600 transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-60">{saving ? t('common.saving') : t('products.saveProduct')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
