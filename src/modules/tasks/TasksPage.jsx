import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CheckCheck, Megaphone, Plus, Send } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { formatDate, formatDateTime } from '../../utils/format.js';

export default function TasksPage() {
  const { t } = useTranslation();
  const { user, activeBusinessId, socket, hasPermission } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [recipientUserId, setRecipientUserId] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigned_to_user_id: '', priority: 'medium', deadline: '' });
  const [annForm, setAnnForm] = useState({ title: '', body: '' });
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const markMessagesRead = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      await api.patch('/messages/read');
    } catch {
      // non-fatal
    }
  }, [activeBusinessId]);

  const loadAll = useCallback(async () => {
    if (!activeBusinessId) return;
    try {
      setError('');
      const [tRes, aRes, mRes, memRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/announcements'),
        api.get('/messages'),
        hasPermission('employees.view') ? api.get('/members') : Promise.resolve({ data: { members: [] } }),
      ]);
      const loadedMessages = mRes.data.messages || [];
      setTasks(tRes.data.tasks || []);
      setAnnouncements(aRes.data.announcements || []);
      setMessages(loadedMessages);
      setMembers(memRes.data.members || []);

      if (loadedMessages.some((m) => !m.is_read && m.sender_user_id !== user?.id)) {
        markMessagesRead();
      }
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId, hasPermission, markMessagesRead, user?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!socket) return;
    const onNewMsg = (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_user_id !== user?.id) {
        markMessagesRead();
      }
    };
    const onMsgRead = (evt) => {
      if (!evt?.messageIds?.length) return;
      const idSet = new Set(evt.messageIds);
      setMessages((prev) =>
        prev.map((m) => (idSet.has(m.id) ? { ...m, is_read: true, read_at: evt.readAt || m.read_at } : m))
      );
    };
    const onUpdate = () => loadAll();
    socket.on('message:new', onNewMsg);
    socket.on('message:read', onMsgRead);
    socket.on('task:updated', onUpdate);
    socket.on('announcement:created', onUpdate);
    return () => {
      socket.off('message:new', onNewMsg);
      socket.off('message:read', onMsgRead);
      socket.off('task:updated', onUpdate);
      socket.off('announcement:created', onUpdate);
    };
  }, [socket, loadAll, markMessagesRead, user?.id]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    try {
      await api.post('/tasks', taskForm);
      setShowTaskModal(false);
      setTaskForm({ title: '', description: '', assigned_to_user_id: '', priority: 'medium', deadline: '' });
      await loadAll();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAnn = async (e) => {
    e.preventDefault();
    if (saving) return;
    setModalError('');
    setSaving(true);
    try {
      await api.post('/announcements', annForm);
      setShowAnnModal(false);
      setAnnForm({ title: '', body: '' });
      await loadAll();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!msgText.trim()) return;
    setError('');
    try {
      await api.post('/messages', {
        body: msgText.trim(),
        channel_type: recipientUserId ? 'direct' : 'general',
        recipient_user_id: recipientUserId ? Number(recipientUserId) : null,
      });
      setMsgText('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStatusChange = async (id, status) => {
    setError('');
    try {
      await api.patch(`/tasks/${id}`, { status });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const otherMembers = members.filter((m) => m.user_id !== user?.id && m.status === 'active');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">{t('tasks.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('tasks.subtitle')}</p>
        </div>
        {hasPermission('tasks.manage') && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setModalError(''); setShowAnnModal(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <Megaphone className="w-3.5 h-3.5" />
              {t('tasks.postAnnouncement')}
            </button>
            <button type="button" onClick={() => { setModalError(''); setShowTaskModal(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" />
              {t('tasks.assignTask')}
            </button>
          </div>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tasks List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('tasks.teamTasks', { count: tasks.length })}</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">{t('tasks.noTasks')}</div>
              ) : (
                tasks.map((task) => {
                  const priorityLabel = {
                    low: t('tasks.priorityLow'),
                    medium: t('tasks.priorityMedium'),
                    high: t('tasks.priorityHigh'),
                    urgent: t('tasks.priorityUrgent'),
                  }[task.priority] || task.priority;
                  return (
                    <div key={task.id} className="py-3 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{task.title}</div>
                          <div className="text-slate-600 dark:text-slate-300 mt-0.5">{task.description}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5 flex-wrap">
                            {task.assigned_to_name && (
                              <UserAvatar src={task.assigned_to_avatar} name={task.assigned_to_name} size="xs" />
                            )}
                            <span>
                              {t('tasks.assignedMeta', {
                                name: task.assigned_to_name || t('tasks.unassigned'),
                                priority: priorityLabel,
                                due: formatDate(task.deadline),
                              })}
                            </span>
                          </div>
                        </div>
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task.id, e.target.value)}
                          className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                        >
                          <option value="pending">{t('status.pending')}</option>
                          <option value="in_progress">{t('status.in_progress')}</option>
                          <option value="completed">{t('status.completed')}</option>
                          <option value="cancelled">{t('status.cancelled')}</option>
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('tasks.announcementsTitle')}</h2>
            {announcements.length === 0 ? (
              <div className="text-xs text-slate-400 dark:text-slate-500">{t('tasks.noAnnouncements')}</div>
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div key={a.id} className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                    <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100">
                      <span>{a.title}</span>
                      <span className="text-slate-400 dark:text-slate-500 font-normal">{formatDate(a.created_at)}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 mt-1">{a.body}</p>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t('tasks.postedBy', { name: a.author_name })}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Real-time Internal Business Team Chat with Accurate Sent/Read States */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col h-[540px]">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('tasks.teamChannelTitle')}</h2>
            <StatusBadge status="active" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-xs text-slate-400 dark:text-slate-500 py-10">{t('tasks.noMessages')}</div>
            ) : (
              messages.map((m) => {
                const isMine = m.sender_user_id === user?.id;
                return (
                  <div key={m.id} className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-lg border border-slate-100 dark:border-slate-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserAvatar src={m.sender_avatar} name={m.sender_name} size="xs" />
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{m.sender_name}</span>
                        {m.recipient_user_id && (
                          <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400 truncate">
                            → {m.recipient_name || t('tasks.directTag')}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">{formatDateTime(m.created_at)}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 pl-8">{m.body}</p>
                    {isMine && (
                      <div className="pl-8 flex items-center gap-1 text-[10px] tabular-nums">
                        {m.is_read ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                            <CheckCheck className="w-3 h-3" />
                            {m.read_at ? t('tasks.readAt', { time: formatDateTime(m.read_at) }) : t('tasks.readState')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
                            <Check className="w-3 h-3" />
                            {t('tasks.sentState')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            {otherMembers.length > 0 && (
              <select
                value={recipientUserId}
                onChange={(e) => setRecipientUserId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[11px] border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                <option value="">{t('tasks.allTeamChannel')}</option>
                {otherMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {t('tasks.directToMember', { name: m.full_name })}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <input
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                placeholder={t('tasks.messagePlaceholder')}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <button type="submit" className="px-3.5 py-2 bg-[#0B192C] dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('tasks.taskModalTitle')}</h2>
            {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <input required placeholder={t('tasks.taskTitlePlaceholder')} value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <textarea rows={2} placeholder={t('tasks.descriptionPlaceholder')} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="grid grid-cols-2 gap-2">
                <select value={taskForm.assigned_to_user_id} onChange={(e) => setTaskForm({ ...taskForm, assigned_to_user_id: e.target.value })} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  <option value="">{t('tasks.unassigned')}</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                </select>
                <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  <option value="low">{t('tasks.priorityLow')}</option>
                  <option value="medium">{t('tasks.priorityMedium')}</option>
                  <option value="high">{t('tasks.priorityHigh')}</option>
                  <option value="urgent">{t('tasks.priorityUrgent')}</option>
                </select>
              </div>
              <input type="date" value={taskForm.deadline} onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setShowTaskModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50">{saving ? t('common.saving') : t('tasks.createTask')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAnnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">{t('tasks.annModalTitle')}</h2>
            {modalError && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{modalError}</div>}
            <form onSubmit={handleCreateAnn} className="space-y-3 text-xs">
              <input required placeholder={t('tasks.annHeadlinePlaceholder')} value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <textarea required rows={3} placeholder={t('tasks.annBodyPlaceholder')} value={annForm.body} onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={saving} onClick={() => setShowAnnModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">{t('common.cancel')}</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50">{saving ? t('common.saving') : t('tasks.publish')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
