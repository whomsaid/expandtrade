import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus, Send } from 'lucide-react';
import { api } from '../../services/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { formatDate, formatDateTime } from '../../utils/format.js';

export default function TasksPage() {
  const { activeBusinessId, socket, hasPermission } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigned_to_user_id: '', priority: 'medium', deadline: '' });
  const [annForm, setAnnForm] = useState({ title: '', body: '' });
  const [error, setError] = useState('');

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
      setTasks(tRes.data.tasks || []);
      setAnnouncements(aRes.data.announcements || []);
      setMessages(mRes.data.messages || []);
      setMembers(memRes.data.members || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeBusinessId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!socket) return;
    const onNewMsg = (msg) => setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    const onUpdate = () => loadAll();
    socket.on('message:new', onNewMsg);
    socket.on('task:updated', onUpdate);
    socket.on('announcement:created', onUpdate);
    return () => {
      socket.off('message:new', onNewMsg);
      socket.off('task:updated', onUpdate);
      socket.off('announcement:created', onUpdate);
    };
  }, [socket, loadAll]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/tasks', taskForm);
      setShowTaskModal(false);
      setTaskForm({ title: '', description: '', assigned_to_user_id: '', priority: 'medium', deadline: '' });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateAnn = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/announcements', annForm);
      setShowAnnModal(false);
      setAnnForm({ title: '', body: '' });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!msgText.trim()) return;
    setError('');
    try {
      await api.post('/messages', { body: msgText.trim(), channel_type: 'general' });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0B192C] dark:text-slate-100">Tasks & Internal Team Communication</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Assign branch tasks, post operational announcements, and chat with authenticated colleagues.</p>
        </div>
        {hasPermission('tasks.manage') && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowAnnModal(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <Megaphone className="w-3.5 h-3.5" />
              Post Announcement
            </button>
            <button type="button" onClick={() => setShowTaskModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Assign Task
            </button>
          </div>
        )}
      </div>

      {error && <div className="p-3 text-xs text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tasks List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Team Tasks ({tasks.length})</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">No tasks assigned yet.</div>
              ) : (
                tasks.map((task) => (
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
                            Assigned: {task.assigned_to_name || 'Unassigned'} · Priority: {task.priority} · Due: {formatDate(task.deadline)}
                          </span>
                        </div>
                      </div>
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Internal Announcements</h2>
            {announcements.length === 0 ? (
              <div className="text-xs text-slate-400 dark:text-slate-500">No announcements posted.</div>
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div key={a.id} className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                    <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100">
                      <span>{a.title}</span>
                      <span className="text-slate-400 dark:text-slate-500 font-normal">{formatDate(a.created_at)}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 mt-1">{a.body}</p>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Posted by {a.author_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Real-time Business Team Chat */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col h-[520px]">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Workspace Team Channel</h2>
            <StatusBadge status="active" />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-xs text-slate-400 dark:text-slate-500 py-10">No messages yet. Start a real team thread below.</div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-lg border border-slate-100 dark:border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar src={m.sender_avatar} name={m.sender_name} size="xs" />
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{m.sender_name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0">{formatDateTime(m.created_at)}</span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 pl-8">{m.body}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
            <input
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              placeholder="Write a message to your team..."
              className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <button type="submit" className="px-3.5 py-2 bg-[#0B192C] dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">Assign Task</h2>
            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <input required placeholder="Task Title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <textarea rows={2} placeholder="Description" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="grid grid-cols-2 gap-2">
                <select value={taskForm.assigned_to_user_id} onChange={(e) => setTaskForm({ ...taskForm, assigned_to_user_id: e.target.value })} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  <option value="">Unassigned</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                </select>
                <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <input type="date" value={taskForm.deadline} onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTaskModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAnnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 animate-scale-in">
            <h2 className="text-base font-bold text-[#0B192C] dark:text-slate-100">Post Business Announcement</h2>
            <form onSubmit={handleCreateAnn} className="space-y-3 text-xs">
              <input required placeholder="Announcement Headline" value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <textarea required rows={3} placeholder="Message to all branches..." value={annForm.body} onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAnnModal(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
                <button type="submit" className="px-4 py-2 font-semibold text-white bg-[#0B192C] dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500">Publish</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
