import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Inbox, Send, Star, Archive, Trash2, RefreshCcw, Search,
  ChevronLeft, ArrowLeft, Reply, MailPlus, X, Paperclip,
  CheckSquare, Square, StarOff, Eye, EyeOff, ArchiveRestore,
  Headphones, MessageSquare, ChevronDown,
} from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';

// ─────────────────── Types ───────────────────
type Mailbox = 'sales' | 'support';
type Folder = 'inbox' | 'sent' | 'all' | 'archived';

interface Email {
  id: string;
  mailbox: Mailbox;
  direction: 'inbound' | 'outbound';
  thread_id: string | null;
  from_email: string;
  from_name: string | null;
  to_email: string;
  to_name: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  resend_id: string | null;
  resend_status: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface UnreadCounts {
  sales: number;
  support: number;
}

// ─────────────────── Helpers ───────────────────
const MAILBOX_LABELS: Record<Mailbox, string> = {
  sales: 'Ventas',
  support: 'Soporte',
};

const MAILBOX_EMAILS: Record<Mailbox, string> = {
  sales: 'info@mainds.app',
  support: 'soporte@mainds.app',
};

const FOLDER_LABELS: Record<Folder, string> = {
  inbox: 'Recibidos',
  sent: 'Enviados',
  all: 'Todos',
  archived: 'Archivados',
};

const timeAgo = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
};

const stripHtml = (html: string): string => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

// ─────────────────── Component ───────────────────
const EmailInbox: React.FC = () => {
  // State
  const [mailbox, setMailbox] = useState<Mailbox>('sales');
  const [folder, setFolder] = useState<Folder>('inbox');
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({ sales: 0, support: 0 });

  // View states
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [thread, setThread] = useState<Email[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<string | null>(null);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // ─── Fetch emails ───
  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        mailbox,
        folder,
        page: String(page),
        limit: '50',
      });
      if (search) params.set('search', search);

      const res = await apiFetch(`${API_URL}/admin/emails?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Error loading emails:', err);
    }
    setLoading(false);
  }, [mailbox, folder, page, search]);

  const loadUnreadCounts = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/admin/emails/unread-counts`);
      if (res.ok) setUnreadCounts(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadEmails(); }, [loadEmails]);
  useEffect(() => { loadUnreadCounts(); }, [loadUnreadCounts]);

  // Debounced search
  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(v);
      setPage(1);
    }, 400);
  };

  // ─── View email / thread ───
  const openEmail = async (email: Email) => {
    setSelectedEmail(email);
    setThreadLoading(true);
    try {
      // Mark as read
      if (!email.is_read && email.direction === 'inbound') {
        await apiFetch(`${API_URL}/admin/emails/${email.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_read: true }),
        });
        setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e));
        loadUnreadCounts();
      }

      // Load thread
      const res = await apiFetch(`${API_URL}/admin/emails/${email.id}/thread`);
      if (res.ok) {
        const data = await res.json();
        setThread(data.length > 1 ? data : [email]);
      } else {
        setThread([email]);
      }
    } catch {
      setThread([email]);
    }
    setThreadLoading(false);
  };

  const closeEmail = () => {
    setSelectedEmail(null);
    setThread([]);
  };

  // ─── Actions ───
  const toggleStar = async (emailId: string, current: boolean) => {
    await apiFetch(`${API_URL}/admin/emails/${emailId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_starred: !current }),
    });
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, is_starred: !current } : e));
  };

  const archiveEmail = async (emailId: string) => {
    await apiFetch(`${API_URL}/admin/emails/${emailId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_archived: true }),
    });
    setEmails(prev => prev.filter(e => e.id !== emailId));
    if (selectedEmail?.id === emailId) closeEmail();
    loadUnreadCounts();
  };

  const deleteEmail = async (emailId: string) => {
    await apiFetch(`${API_URL}/admin/emails/${emailId}`, { method: 'DELETE' });
    setEmails(prev => prev.filter(e => e.id !== emailId));
    if (selectedEmail?.id === emailId) closeEmail();
    loadUnreadCounts();
  };

  const batchAction = async (action: 'read' | 'unread' | 'archive') => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const updates =
      action === 'read' ? { is_read: true } :
      action === 'unread' ? { is_read: false } :
      { is_archived: true };
    await apiFetch(`${API_URL}/admin/emails/batch`, {
      method: 'POST',
      body: JSON.stringify({ ids, updates }),
    });
    loadEmails();
    loadUnreadCounts();
    setSelected(new Set());
  };

  // ─── Compose / Reply ───
  const openCompose = () => {
    setComposeTo('');
    setComposeCc('');
    setComposeSubject('');
    setComposeBody('');
    setComposeReplyTo(null);
    setShowCompose(true);
  };

  const openReply = (email: Email) => {
    const replyTo = email.direction === 'inbound' ? email.from_email : email.to_email;
    setComposeTo(replyTo);
    setComposeCc('');
    setComposeSubject(email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`);
    setComposeBody(`\n\n<br/><br/>—— ${email.from_name || email.from_email} escribió el ${new Date(email.created_at).toLocaleString('es-ES')} ——<br/>${email.body_html || email.body_text || ''}`);
    setComposeReplyTo(email.id);
    setShowCompose(true);
  };

  const sendEmail = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) return;
    setComposeSending(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/emails/send`, {
        method: 'POST',
        body: JSON.stringify({
          mailbox,
          to: composeTo.split(',').map(e => e.trim()).filter(Boolean),
          cc: composeCc ? composeCc.split(',').map(e => e.trim()).filter(Boolean) : undefined,
          subject: composeSubject,
          body_html: composeBody,
          reply_to_id: composeReplyTo,
        }),
      });
      if (res.ok) {
        setShowCompose(false);
        loadEmails();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Error al enviar el email');
      }
    } catch (err) {
      alert('Error de conexión al enviar');
    }
    setComposeSending(false);
  };

  // ─── Selection helpers ───
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    if (selected.size === emails.length) setSelected(new Set());
    else setSelected(new Set(emails.map(e => e.id)));
  };

  // ─── Switch mailbox ───
  const switchMailbox = (mb: Mailbox) => {
    setMailbox(mb);
    setFolder('inbox');
    setPage(1);
    setSearch('');
    setSearchInput('');
    closeEmail();
    setSelected(new Set());
  };

  const totalPages = Math.ceil(total / 50);

  // ─────────────────── Render ───────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* ── Top bar: mailbox selector + search ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
        {/* Mailbox tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 flex-shrink-0">
          {(['sales', 'support'] as const).map(mb => (
            <button
              key={mb}
              onClick={() => switchMailbox(mb)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                mailbox === mb
                  ? mb === 'sales'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {mb === 'sales' ? <MessageSquare size={13} /> : <Headphones size={13} />}
              {MAILBOX_LABELS[mb]}
              {unreadCounts[mb] > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  mailbox === mb ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'
                }`}>
                  {unreadCounts[mb]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Folder tabs */}
        <div className="flex gap-0.5 flex-shrink-0">
          {(['inbox', 'sent', 'all', 'archived'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFolder(f); setPage(1); setSelected(new Set()); }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                folder === f
                  ? 'bg-slate-200 text-slate-800'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f === 'inbox' && <Inbox size={12} className="inline mr-1" />}
              {f === 'sent' && <Send size={12} className="inline mr-1" />}
              {f === 'archived' && <Archive size={12} className="inline mr-1" />}
              {FOLDER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 relative ml-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            placeholder="Buscar emails…"
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-sm focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={openCompose} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
            <MailPlus size={14} /> Nuevo
          </button>
          <button onClick={() => { loadEmails(); loadUnreadCounts(); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all" title="Refrescar">
            <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Batch actions bar ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
          <span className="text-xs font-semibold text-indigo-700">{selected.size} seleccionado{selected.size > 1 ? 's' : ''}</span>
          <button onClick={() => batchAction('read')} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-indigo-100 rounded transition-colors"><Eye size={12} /> Marcar leído</button>
          <button onClick={() => batchAction('unread')} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-indigo-100 rounded transition-colors"><EyeOff size={12} /> Marcar no leído</button>
          <button onClick={() => batchAction('archive')} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-indigo-100 rounded transition-colors"><Archive size={12} /> Archivar</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-400 hover:text-slate-600">Deseleccionar</button>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 overflow-hidden flex">
        {selectedEmail ? (
          /* ── Email detail / thread view ── */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Detail header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <button onClick={closeEmail} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <ArrowLeft size={16} />
              </button>
              <h2 className="text-sm font-semibold text-slate-800 truncate flex-1">{selectedEmail.subject}</h2>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openReply(selectedEmail)} className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors">
                  <Reply size={13} /> Responder
                </button>
                <button onClick={() => archiveEmail(selectedEmail.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors" title="Archivar">
                  <Archive size={14} />
                </button>
                <button onClick={() => deleteEmail(selectedEmail.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Thread messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {threadLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCcw className="animate-spin text-indigo-400" size={24} />
                </div>
              ) : (
                thread.map((msg, idx) => (
                  <div key={msg.id} className={`rounded-xl border ${msg.direction === 'inbound' ? 'border-slate-200 bg-white' : 'border-indigo-100 bg-indigo-50/30'}`}>
                    {/* Message header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${
                        msg.direction === 'inbound' ? 'bg-gradient-to-br from-slate-500 to-slate-700' : 'bg-gradient-to-br from-indigo-500 to-purple-600'
                      }`}>
                        {(msg.from_name || msg.from_email).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800 truncate">
                            {msg.from_name || msg.from_email}
                          </span>
                          <span className="text-xs text-slate-400">&lt;{msg.from_email}&gt;</span>
                          {msg.direction === 'outbound' && (
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] font-semibold rounded-full">Enviado</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Para: {msg.to_email}
                          {msg.cc && <> · CC: {msg.cc}</>}
                          {' · '}
                          {new Date(msg.created_at).toLocaleString('es-ES', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                          {msg.resend_status && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              msg.resend_status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                              msg.resend_status === 'opened' ? 'bg-blue-100 text-blue-700' :
                              msg.resend_status === 'bounced' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {msg.resend_status}
                            </span>
                          )}
                        </p>
                      </div>
                      {idx === thread.length - 1 && (
                        <button
                          onClick={() => openReply(msg)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex-shrink-0"
                          title="Responder a este mensaje"
                        >
                          <Reply size={14} />
                        </button>
                      )}
                    </div>
                    {/* Message body */}
                    <div className="px-4 py-4">
                      {msg.body_html ? (
                        <div
                          className="prose prose-sm max-w-none text-slate-700 [&_a]:text-indigo-600 [&_a]:underline [&_img]:max-w-full [&_img]:rounded"
                          dangerouslySetInnerHTML={{ __html: msg.body_html }}
                        />
                      ) : (
                        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{msg.body_text || '(sin contenido)'}</pre>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* ── Email list ── */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Select all header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 text-xs text-slate-400 flex-shrink-0">
              <button onClick={selectAll} className="p-0.5">
                {selected.size === emails.length && emails.length > 0 ? <CheckSquare size={14} className="text-indigo-500" /> : <Square size={14} />}
              </button>
              <span className="flex-1">
                {total > 0 ? `${total} email${total !== 1 ? 's' : ''}` : 'Sin emails'}
                {total > 50 && ` · Página ${page} de ${totalPages}`}
              </span>
              {totalPages > 1 && (
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">←</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-colors">→</button>
                </div>
              )}
            </div>

            {/* Email rows */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCcw className="animate-spin text-indigo-400" size={24} />
                  <span className="ml-2 text-sm text-slate-400">Cargando…</span>
                </div>
              ) : emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Inbox size={40} className="mb-3 text-slate-300" />
                  <p className="text-sm font-medium">No hay emails en esta carpeta</p>
                  <p className="text-xs mt-1">Los emails de {MAILBOX_EMAILS[mailbox]} aparecerán aquí</p>
                </div>
              ) : (
                emails.map(email => {
                  const isSelected = selected.has(email.id);
                  const preview = email.body_text || stripHtml(email.body_html || '');
                  return (
                    <div
                      key={email.id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors group ${
                        isSelected ? 'bg-indigo-50' :
                        !email.is_read ? 'bg-white hover:bg-slate-50' :
                        'bg-slate-50/50 hover:bg-slate-100/70'
                      }`}
                      onClick={() => openEmail(email)}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={e => { e.stopPropagation(); toggleSelect(email.id); }}
                        className="p-0.5 flex-shrink-0"
                      >
                        {isSelected ? <CheckSquare size={15} className="text-indigo-500" /> : <Square size={15} className="text-slate-300 group-hover:text-slate-400" />}
                      </button>

                      {/* Star */}
                      <button
                        onClick={e => { e.stopPropagation(); toggleStar(email.id, email.is_starred); }}
                        className="p-0.5 flex-shrink-0"
                      >
                        <Star size={14} className={email.is_starred ? 'fill-amber-400 text-amber-400' : 'text-slate-300 group-hover:text-slate-400'} />
                      </button>

                      {/* Direction indicator */}
                      <div className="flex-shrink-0">
                        {email.direction === 'inbound' ? (
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
                            <Inbox size={11} className="text-slate-500" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                            <Send size={11} className="text-indigo-500" />
                          </div>
                        )}
                      </div>

                      {/* Sender / recipient */}
                      <div className="w-36 flex-shrink-0 truncate">
                        <span className={`text-sm ${!email.is_read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                          {email.direction === 'inbound'
                            ? (email.from_name || email.from_email.split('@')[0])
                            : `Para: ${email.to_email.split(',')[0].trim().split('@')[0]}`
                          }
                        </span>
                      </div>

                      {/* Subject + preview */}
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className={`text-sm truncate ${!email.is_read ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
                          {email.subject}
                        </span>
                        <span className="text-xs text-slate-400 truncate hidden sm:inline">
                          — {preview.slice(0, 100)}
                        </span>
                      </div>

                      {/* Status badge */}
                      {email.resend_status && email.direction === 'outbound' && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 hidden md:inline ${
                          email.resend_status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                          email.resend_status === 'opened' ? 'bg-blue-100 text-blue-700' :
                          email.resend_status === 'bounced' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {email.resend_status}
                        </span>
                      )}

                      {/* Unread dot */}
                      {!email.is_read && email.direction === 'inbound' && (
                        <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                      )}

                      {/* Time */}
                      <span className="text-xs text-slate-400 flex-shrink-0 w-10 text-right">
                        {timeAgo(email.created_at)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Compose modal ── */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setShowCompose(false)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Compose header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
              <h3 className="text-sm font-semibold text-slate-800">
                {composeReplyTo ? 'Responder' : 'Nuevo email'}
                <span className="ml-2 text-xs font-normal text-slate-400">desde {MAILBOX_EMAILS[mailbox]}</span>
              </h3>
              <button onClick={() => setShowCompose(false)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* To */}
              <div className="flex items-center border-b border-slate-100 px-5">
                <span className="text-xs text-slate-400 w-10 flex-shrink-0">Para:</span>
                <input
                  value={composeTo}
                  onChange={e => setComposeTo(e.target.value)}
                  placeholder="email@ejemplo.com"
                  className="flex-1 py-2.5 text-sm border-0 outline-none bg-transparent"
                />
              </div>

              {/* CC */}
              <div className="flex items-center border-b border-slate-100 px-5">
                <span className="text-xs text-slate-400 w-10 flex-shrink-0">CC:</span>
                <input
                  value={composeCc}
                  onChange={e => setComposeCc(e.target.value)}
                  placeholder="opcional"
                  className="flex-1 py-2.5 text-sm border-0 outline-none bg-transparent"
                />
              </div>

              {/* Subject */}
              <div className="flex items-center border-b border-slate-100 px-5">
                <span className="text-xs text-slate-400 w-10 flex-shrink-0">Asunto:</span>
                <input
                  value={composeSubject}
                  onChange={e => setComposeSubject(e.target.value)}
                  placeholder="Asunto del email"
                  className="flex-1 py-2.5 text-sm border-0 outline-none bg-transparent font-medium"
                />
              </div>

              {/* Body */}
              <textarea
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder="Escribe tu mensaje…"
                className="w-full min-h-[200px] px-5 py-3 text-sm border-0 outline-none bg-transparent resize-none"
                rows={10}
              />
            </div>

            {/* Compose footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
              <div className="text-xs text-slate-400">
                Enviando como <strong>{MAILBOX_EMAILS[mailbox]}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCompose(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={sendEmail}
                  disabled={composeSending || !composeTo.trim() || !composeSubject.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {composeSending ? <RefreshCcw size={13} className="animate-spin" /> : <Send size={13} />}
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailInbox;
