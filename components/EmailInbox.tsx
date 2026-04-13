import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Inbox, Send, Star, Archive, Trash2, RefreshCcw, Search,
  ArrowLeft, Reply, MailPlus, X,
  CheckSquare, Square, Eye, EyeOff,
  Headphones, MessageSquare, ChevronDown, ChevronUp,
  User, ExternalLink, Tag, Sparkles, Loader2,
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
  lead_id: string | null;
  lead_name: string | null;
  assigned_to: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface UnreadCounts {
  sales: number;
  support: number;
}

// ─────────────────── Helpers ───────────────────
const MAILBOX_LABELS: Record<Mailbox, string> = { sales: 'Ventas', support: 'Soporte' };
const MAILBOX_EMAILS: Record<Mailbox, string> = { sales: 'info@mainds.app', support: 'soporte@mainds.app' };
const FOLDER_ICONS: Record<Folder, React.ReactNode> = {
  inbox: <Inbox size={14} />, sent: <Send size={14} />, all: <MessageSquare size={14} />, archived: <Archive size={14} />,
};
const FOLDER_LABELS: Record<Folder, string> = { inbox: 'Recibidos', sent: 'Enviados', all: 'Todos', archived: 'Archivados' };

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

const fullDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const stripHtml = (html: string): string => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
};

const avatarColor = (email: string): string => {
  const colors = [
    'from-blue-500 to-blue-700', 'from-emerald-500 to-emerald-700', 'from-violet-500 to-violet-700',
    'from-rose-500 to-rose-700', 'from-amber-500 to-amber-700', 'from-cyan-500 to-cyan-700',
    'from-pink-500 to-pink-700', 'from-teal-500 to-teal-700',
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const statusLabel: Record<string, { label: string; cls: string }> = {
  sent: { label: 'Enviado', cls: 'bg-slate-100 text-slate-500' },
  delivered: { label: 'Entregado', cls: 'bg-emerald-50 text-emerald-600' },
  opened: { label: 'Abierto', cls: 'bg-blue-50 text-blue-600' },
  clicked: { label: 'Clic', cls: 'bg-violet-50 text-violet-600' },
  bounced: { label: 'Rebotado', cls: 'bg-red-50 text-red-600' },
};

interface EmailInboxProps {
  onOpenLead?: (leadId: string) => void;
}

// ─────────────────── Component ───────────────────
const EmailInbox: React.FC<EmailInboxProps> = ({ onOpenLead }) => {
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
  const [collapsedMessages, setCollapsedMessages] = useState<Set<string>>(new Set());

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeReplyTo, setComposeReplyTo] = useState<string | null>(null);

  // AI reply
  const [aiLoading, setAiLoading] = useState(false);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Mobile sidebar
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const threadEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  // ─── Fetch emails ───
  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mailbox, folder, page: String(page), limit: '50' });
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
    searchTimeout.current = setTimeout(() => { setSearch(v); setPage(1); }, 400);
  };

  // ─── View email / thread ───
  const openEmail = async (email: Email) => {
    setSelectedEmail(email);
    setThreadLoading(true);
    setCollapsedMessages(new Set());
    try {
      if (!email.is_read && email.direction === 'inbound') {
        await apiFetch(`${API_URL}/admin/emails/${email.id}`, {
          method: 'PATCH', body: JSON.stringify({ is_read: true }),
        });
        setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: true } : e));
        loadUnreadCounts();
      }
      const res = await apiFetch(`${API_URL}/admin/emails/${email.id}/thread`);
      if (res.ok) {
        const data = await res.json();
        const msgs = data.length > 0 ? data : [email];
        setThread(msgs);
        // Collapse all except the last message when there are many
        if (msgs.length > 2) {
          const toCollapse = new Set(msgs.slice(0, -1).map((m: Email) => m.id));
          setCollapsedMessages(toCollapse);
        }
      } else {
        setThread([email]);
      }
    } catch {
      setThread([email]);
    }
    setThreadLoading(false);
    setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const closeEmail = () => { setSelectedEmail(null); setThread([]); };

  // ─── Actions ───
  const toggleStar = async (emailId: string, current: boolean) => {
    await apiFetch(`${API_URL}/admin/emails/${emailId}`, { method: 'PATCH', body: JSON.stringify({ is_starred: !current }) });
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, is_starred: !current } : e));
  };

  const archiveEmail = async (emailId: string) => {
    await apiFetch(`${API_URL}/admin/emails/${emailId}`, { method: 'PATCH', body: JSON.stringify({ is_archived: true }) });
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
    const updates = action === 'read' ? { is_read: true } : action === 'unread' ? { is_read: false } : { is_archived: true };
    await apiFetch(`${API_URL}/admin/emails/batch`, { method: 'POST', body: JSON.stringify({ ids: Array.from(selected), updates }) });
    loadEmails(); loadUnreadCounts(); setSelected(new Set());
  };

  // ─── Compose / Reply ───
  const openCompose = () => {
    setComposeTo(''); setComposeCc(''); setComposeSubject(''); setComposeBody(''); setComposeReplyTo(null); setShowCompose(true);
    setTimeout(() => { if (composerRef.current) { composerRef.current.innerHTML = ''; composerRef.current.focus(); } }, 50);
  };

  const openReply = (email: Email) => {
    const replyTo = email.direction === 'inbound' ? email.from_email : email.to_email;
    setComposeTo(replyTo);
    setComposeCc('');
    setComposeSubject(email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`);
    const quotedHeader = `${email.from_name || email.from_email} — ${fullDate(email.created_at)}`;
    const quotedBody = `<br><br><div style="border-left:3px solid #cbd5e1;padding-left:12px;margin-top:8px;color:#64748b"><p style="font-size:12px;margin-bottom:8px"><strong>${quotedHeader}</strong></p>${email.body_html || (email.body_text || '').replace(/\n/g, '<br>') || ''}</div>`;
    setComposeBody(quotedBody);
    setComposeReplyTo(email.id);
    setShowCompose(true);
    setTimeout(() => { if (composerRef.current) { composerRef.current.innerHTML = quotedBody; composerRef.current.focus(); } }, 50);
  };

  const generateAiReply = async () => {
    if (aiLoading || !selectedEmail) return;
    setAiLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/emails/ai-reply`, {
        method: 'POST',
        body: JSON.stringify({ email_id: selectedEmail.id, thread, mailbox }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestion && composerRef.current) {
          // Insert AI suggestion before the quoted reply
          const currentContent = composerRef.current.innerHTML;
          const quoteIdx = currentContent.indexOf('<br><br><div style="border-left');
          if (quoteIdx > -1) {
            composerRef.current.innerHTML = data.suggestion + currentContent.substring(quoteIdx);
          } else {
            composerRef.current.innerHTML = data.suggestion + currentContent;
          }
          setComposeBody(composerRef.current.innerHTML);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Error al generar respuesta IA');
      }
    } catch { alert('Error de conexión al generar respuesta IA'); }
    setAiLoading(false);
  };

  const sendEmail = async () => {
    const bodyHtml = composerRef.current?.innerHTML || composeBody;
    if (!composeTo.trim() || !composeSubject.trim()) return;
    setComposeSending(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/emails/send`, {
        method: 'POST',
        body: JSON.stringify({
          mailbox, to: composeTo.split(',').map(e => e.trim()).filter(Boolean),
          cc: composeCc ? composeCc.split(',').map(e => e.trim()).filter(Boolean) : undefined,
          subject: composeSubject, body_html: bodyHtml, reply_to_id: composeReplyTo,
        }),
      });
      if (res.ok) { setShowCompose(false); loadEmails(); }
      else { const err = await res.json().catch(() => ({})); alert(err.error || 'Error al enviar'); }
    } catch { alert('Error de conexión al enviar'); }
    setComposeSending(false);
  };

  // ─── Selection helpers ───
  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const selectAll = () => {
    if (selected.size === emails.length) setSelected(new Set());
    else setSelected(new Set(emails.map(e => e.id)));
  };

  const switchMailbox = (mb: Mailbox) => {
    setMailbox(mb); setFolder('inbox'); setPage(1); setSearch(''); setSearchInput(''); closeEmail(); setSelected(new Set()); setShowMobileSidebar(false);
  };

  const totalPages = Math.ceil(total / 50);

  // ─── Lead badge sub-component ───
  const LeadBadge: React.FC<{ email: Email; compact?: boolean }> = ({ email, compact }) => {
    if (!email.lead_id) return null;
    return (
      <button
        onClick={e => { e.stopPropagation(); onOpenLead?.(email.lead_id!); }}
        className={`inline-flex items-center gap-1 rounded-full transition-colors flex-shrink-0 ${
          compact
            ? 'px-1.5 py-0.5 text-[10px] bg-violet-50 text-violet-600 hover:bg-violet-100'
            : 'px-2 py-0.5 text-xs bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200'
        }`}
        title={`Lead: ${email.lead_name || 'Sin nombre'}${email.assigned_to ? ` · Asignado a: ${email.assigned_to}` : ''}`}
      >
        <User size={compact ? 9 : 11} />
        <span className="truncate max-w-[100px]">{email.lead_name || 'Lead'}</span>
        {!compact && email.assigned_to && (
          <span className="text-violet-400 truncate max-w-[80px]">· {email.assigned_to.split('@')[0]}</span>
        )}
        {!compact && <ExternalLink size={10} className="ml-0.5 opacity-50" />}
      </button>
    );
  };

  // ─────────────────── Render ───────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* ── Left sidebar (desktop) / overlay (mobile) ── */}
      <aside className={`
        ${showMobileSidebar ? 'fixed inset-0 z-40 bg-black/30' : 'hidden'}
        md:relative md:block md:bg-transparent md:z-auto
      `} onClick={() => setShowMobileSidebar(false)}>
        <div
          className={`
            w-56 bg-slate-50 border-r border-slate-200 h-full flex flex-col
            ${showMobileSidebar ? 'absolute left-0 top-0 z-50 shadow-xl' : ''}
          `}
          onClick={e => e.stopPropagation()}
        >
          {/* Compose button */}
          <div className="p-3">
            <button onClick={openCompose} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
              <MailPlus size={16} /> Redactar
            </button>
          </div>

          {/* Mailbox selector */}
          <div className="px-3 pb-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">Buzón</p>
            {(['sales', 'support'] as const).map(mb => (
              <button
                key={mb}
                onClick={() => switchMailbox(mb)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  mailbox === mb
                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
                }`}
              >
                {mb === 'sales' ? <MessageSquare size={15} className="text-indigo-500" /> : <Headphones size={15} className="text-orange-500" />}
                <span className="flex-1 text-left">{MAILBOX_LABELS[mb]}</span>
                {unreadCounts[mb] > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">{unreadCounts[mb]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Folder tabs */}
          <div className="px-3 pb-2 space-y-0.5 border-t border-slate-200 pt-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1">Carpetas</p>
            {(['inbox', 'sent', 'all', 'archived'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFolder(f); setPage(1); setSelected(new Set()); setShowMobileSidebar(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  folder === f ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                <span className="text-current opacity-60">{FOLDER_ICONS[f]}</span>
                {FOLDER_LABELS[f]}
              </button>
            ))}
          </div>

          {/* Mailbox info */}
          <div className="mt-auto p-3 border-t border-slate-200">
            <p className="text-[11px] text-slate-400 truncate">{MAILBOX_EMAILS[mailbox]}</p>
          </div>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {selectedEmail ? (
          /* ════════ Thread detail view ════════ */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Thread header */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-slate-100 bg-white flex-shrink-0">
              <button onClick={closeEmail} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0">
                <ArrowLeft size={18} />
              </button>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-slate-800 truncate">{selectedEmail.subject}</h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-slate-400">{thread.length} mensaje{thread.length !== 1 ? 's' : ''}</span>
                  {selectedEmail.lead_id && <LeadBadge email={selectedEmail} />}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => archiveEmail(selectedEmail.id)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors" title="Archivar"><Archive size={16} /></button>
                <button onClick={() => deleteEmail(selectedEmail.id)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar"><Trash2 size={16} /></button>
              </div>
            </div>

            {/* Thread messages */}
            <div className="flex-1 overflow-y-auto">
              {threadLoading ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCcw className="animate-spin text-indigo-400" size={24} />
                </div>
              ) : (
                <div className="py-4 px-3 sm:px-6 space-y-3">
                  {thread.map((msg, idx) => {
                    const isCollapsed = collapsedMessages.has(msg.id);
                    const isLast = idx === thread.length - 1;
                    const senderInitial = (msg.from_name || msg.from_email).charAt(0).toUpperCase();
                    const colorCls = msg.direction === 'outbound' ? 'from-indigo-500 to-violet-600' : avatarColor(msg.from_email);

                    return (
                      <div key={msg.id} className={`rounded-xl border transition-shadow ${
                        msg.direction === 'inbound' ? 'border-slate-200 bg-white' : 'border-indigo-100 bg-gradient-to-br from-indigo-50/30 to-white'
                      } ${isLast ? 'shadow-sm' : ''}`}>
                        {/* Message header — always visible */}
                        <div
                          className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 ${!isCollapsed ? 'border-b border-slate-100/80' : ''} cursor-pointer hover:bg-slate-50/50 transition-colors rounded-t-xl`}
                          onClick={() => {
                            if (isCollapsed) setCollapsedMessages(prev => { const n = new Set(prev); n.delete(msg.id); return n; });
                            else if (!isLast) setCollapsedMessages(prev => new Set(prev).add(msg.id));
                          }}
                        >
                          <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0 bg-gradient-to-br ${colorCls}`}>
                            {senderInitial}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                                {msg.from_name || msg.from_email.split('@')[0]}
                              </span>
                              {msg.direction === 'outbound' && (
                                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[10px] font-semibold rounded-full">Enviado</span>
                              )}
                              {msg.resend_status && statusLabel[msg.resend_status] && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusLabel[msg.resend_status].cls}`}>
                                  {statusLabel[msg.resend_status].label}
                                </span>
                              )}
                            </div>
                            {isCollapsed ? (
                              <p className="text-xs text-slate-400 truncate mt-0.5">
                                {stripHtml(msg.body_html || msg.body_text || '').slice(0, 120)}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400 mt-0.5">
                                Para: {msg.to_email.split(',')[0].trim()}
                                {msg.cc && <> · CC: {msg.cc}</>}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[11px] text-slate-400 hidden sm:inline">{fullDate(msg.created_at)}</span>
                            <span className="text-[11px] text-slate-400 sm:hidden">{timeAgo(msg.created_at)}</span>
                            {thread.length > 1 && (
                              isCollapsed
                                ? <ChevronDown size={14} className="text-slate-300" />
                                : !isLast ? <ChevronUp size={14} className="text-slate-300" /> : null
                            )}
                          </div>
                        </div>

                        {/* Message body — hidden when collapsed */}
                        {!isCollapsed && (
                          <div className="px-3 sm:px-6 py-3 sm:py-4">
                            {msg.body_html ? (
                              <div
                                className="prose prose-sm max-w-none text-slate-700 [&_a]:text-indigo-600 [&_a]:underline [&_img]:max-w-full [&_img]:rounded-lg [&_blockquote]:border-l-slate-300 [&_blockquote]:text-slate-500 overflow-x-auto break-words"
                                dangerouslySetInnerHTML={{ __html: msg.body_html }}
                              />
                            ) : (
                              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed break-words">{msg.body_text || '(sin contenido)'}</pre>
                            )}

                            {/* Reply button at bottom of last message */}
                            {isLast && (
                              <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                                <button
                                  onClick={() => openReply(msg)}
                                  className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
                                >
                                  <Reply size={15} /> Responder
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ════════ Email list view ════════ */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top toolbar */}
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-100 bg-white flex-shrink-0">
              {/* Mobile menu */}
              <button onClick={() => setShowMobileSidebar(true)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 md:hidden">
                <Inbox size={16} />
              </button>

              {/* Checkbox */}
              <button onClick={selectAll} className="p-1 flex-shrink-0 hidden sm:block">
                {selected.size === emails.length && emails.length > 0 ? <CheckSquare size={16} className="text-indigo-500" /> : <Square size={16} className="text-slate-300" />}
              </button>

              {/* Search */}
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={e => handleSearchInput(e.target.value)}
                  placeholder="Buscar emails…"
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-sm focus:bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 transition-all"
                />
              </div>

              {/* Batch actions */}
              {selected.size > 0 ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs font-semibold text-indigo-600 mr-1 hidden sm:inline">{selected.size}</span>
                  <button onClick={() => batchAction('read')} className="p-1.5 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" title="Marcar leído"><Eye size={15} /></button>
                  <button onClick={() => batchAction('unread')} className="p-1.5 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" title="Marcar no leído"><EyeOff size={15} /></button>
                  <button onClick={() => batchAction('archive')} className="p-1.5 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" title="Archivar"><Archive size={15} /></button>
                  <button onClick={() => setSelected(new Set())} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { loadEmails(); loadUnreadCounts(); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all" title="Refrescar">
                    <RefreshCcw size={15} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              )}
            </div>

            {/* Pagination info */}
            {total > 0 && (
              <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-50 text-xs text-slate-400 flex-shrink-0">
                <span>{total} email{total !== 1 ? 's' : ''}{total > 50 ? ` · Pág. ${page}/${totalPages}` : ''}</span>
                {totalPages > 1 && (
                  <div className="flex gap-1">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs">←</button>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-xs">→</button>
                  </div>
                )}
              </div>
            )}

            {/* Email rows */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCcw className="animate-spin text-indigo-400" size={24} />
                  <span className="ml-2 text-sm text-slate-400">Cargando…</span>
                </div>
              ) : emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Inbox size={44} className="mb-3 text-slate-300" />
                  <p className="text-sm font-medium">No hay emails en esta carpeta</p>
                  <p className="text-xs mt-1 text-slate-300">{MAILBOX_EMAILS[mailbox]}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {emails.map(email => {
                    const isSelected = selected.has(email.id);
                    const preview = email.body_text || stripHtml(email.body_html || '');
                    const senderDisplay = email.direction === 'inbound'
                      ? (email.from_name || email.from_email.split('@')[0])
                      : (email.to_name || email.to_email.split(',')[0].trim().split('@')[0]);
                    const senderInitial = senderDisplay.charAt(0).toUpperCase();
                    const colorCls = email.direction === 'outbound' ? 'from-indigo-500 to-violet-600' : avatarColor(email.from_email);

                    return (
                      <div
                        key={email.id}
                        className={`flex items-start sm:items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-2 cursor-pointer transition-all group ${
                          isSelected ? 'bg-indigo-50' :
                          !email.is_read ? 'bg-white hover:bg-blue-50/30' :
                          'hover:bg-slate-50'
                        }`}
                        onClick={() => openEmail(email)}
                      >
                        {/* Checkbox (desktop) or Avatar (mobile) */}
                        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5 sm:pt-0">
                          <button onClick={e => { e.stopPropagation(); toggleSelect(email.id); }} className="p-0.5 hidden sm:block">
                            {isSelected ? <CheckSquare size={16} className="text-indigo-500" /> : <Square size={16} className="text-slate-300 group-hover:text-slate-400" />}
                          </button>
                          <button onClick={e => { e.stopPropagation(); toggleStar(email.id, email.is_starred); }} className="p-0.5 hidden sm:block">
                            <Star size={14} className={email.is_starred ? 'fill-amber-400 text-amber-400' : 'text-slate-300 group-hover:text-slate-400'} />
                          </button>
                          <div className={`w-8 h-8 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-white text-xs font-bold bg-gradient-to-br ${colorCls}`}>
                            {senderInitial}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-sm truncate ${!email.is_read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                              {email.direction === 'inbound' ? senderDisplay : `Para: ${senderDisplay}`}
                            </span>
                            {!email.is_read && email.direction === 'inbound' && (
                              <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                            )}
                            {email.lead_id && <LeadBadge email={email} compact />}
                            <span className="text-[11px] text-slate-400 ml-auto flex-shrink-0">{timeAgo(email.created_at)}</span>
                          </div>
                          <p className={`text-sm truncate ${!email.is_read ? 'font-medium text-slate-700' : 'text-slate-600'}`}>
                            {email.subject}
                          </p>
                          <p className="text-xs text-slate-400 truncate mt-0.5 hidden sm:block">
                            {preview.slice(0, 140)}
                          </p>
                          {/* Mobile-only: status + star */}
                          <div className="flex items-center gap-2 mt-1 sm:hidden">
                            {email.resend_status && email.direction === 'outbound' && statusLabel[email.resend_status] && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusLabel[email.resend_status].cls}`}>
                                {statusLabel[email.resend_status].label}
                              </span>
                            )}
                            <button onClick={e => { e.stopPropagation(); toggleStar(email.id, email.is_starred); }} className="ml-auto p-0.5">
                              <Star size={13} className={email.is_starred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
                            </button>
                          </div>
                        </div>

                        {/* Right side — desktop only */}
                        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                          {email.resend_status && email.direction === 'outbound' && statusLabel[email.resend_status] && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusLabel[email.resend_status].cls}`}>
                              {statusLabel[email.resend_status].label}
                            </span>
                          )}
                          {email.assigned_to && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[80px]" title={`Asignado: ${email.assigned_to}`}>
                              {email.assigned_to.split('@')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Compose modal ── */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setShowCompose(false)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[80vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 flex-shrink-0">
              <h3 className="text-sm font-semibold text-white">
                {composeReplyTo ? '↩ Responder' : '✉ Nuevo email'}
              </h3>
              <button onClick={() => setShowCompose(false)} className="p-1 rounded-lg hover:bg-white/10 text-white/70 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* From */}
              <div className="flex items-center border-b border-slate-100 px-5 py-2 bg-slate-50/50">
                <span className="text-xs text-slate-400 w-12 flex-shrink-0">De:</span>
                <span className="text-sm text-slate-600">{MAILBOX_EMAILS[mailbox]}</span>
              </div>
              {/* To */}
              <div className="flex items-center border-b border-slate-100 px-5">
                <span className="text-xs text-slate-400 w-12 flex-shrink-0">Para:</span>
                <input value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="email@ejemplo.com" className="flex-1 py-2.5 text-sm border-0 outline-none bg-transparent" autoFocus />
              </div>
              {/* CC */}
              <div className="flex items-center border-b border-slate-100 px-5">
                <span className="text-xs text-slate-400 w-12 flex-shrink-0">CC:</span>
                <input value={composeCc} onChange={e => setComposeCc(e.target.value)} placeholder="opcional" className="flex-1 py-2.5 text-sm border-0 outline-none bg-transparent" />
              </div>
              {/* Subject */}
              <div className="flex items-center border-b border-slate-100 px-5">
                <span className="text-xs text-slate-400 w-12 flex-shrink-0">Asunto:</span>
                <input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} placeholder="Asunto del email" className="flex-1 py-2.5 text-sm border-0 outline-none bg-transparent font-medium" />
              </div>
              {/* Body */}
              <div className="px-5 py-3">
                <div
                  ref={composerRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => setComposeBody(composerRef.current?.innerHTML || '')}
                  data-placeholder="Escribe tu mensaje…"
                  className="w-full min-h-[200px] sm:min-h-[280px] text-sm border-0 outline-none bg-transparent leading-relaxed prose prose-sm max-w-none focus:outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-slate-400 [&_blockquote]:border-l-slate-300 [&_blockquote]:text-slate-500 [&_div]:text-slate-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-t border-slate-100 bg-slate-50/50 flex-shrink-0 gap-2">
              <button onClick={() => setShowCompose(false)} className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                Descartar
              </button>
              <div className="flex items-center gap-2">
                {composeReplyTo && (
                  <button
                    onClick={generateAiReply}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Generar respuesta con IA"
                  >
                    {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    <span className="hidden sm:inline">IA</span>
                  </button>
                )}
                <button
                  onClick={sendEmail}
                  disabled={composeSending || !composeTo.trim() || !composeSubject.trim()}
                  className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {composeSending ? <RefreshCcw size={14} className="animate-spin" /> : <Send size={14} />}
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
