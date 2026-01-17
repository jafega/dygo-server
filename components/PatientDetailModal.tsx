import React, { useState, useEffect, useRef } from 'react';
import { PatientSummary, JournalEntry, ClinicalNoteContent, Attachment, Goal } from '../types';
import { getEntriesForUser, updateEntry, saveEntry, deleteEntry, getGoalsForUser, saveUserGoals } from '../services/storageService';
import { analyzeClinicalSession, analyzeJournalEntry } from '../services/genaiService';
import InsightsPanel from './InsightsPanel';
import GoalsPanel from './GoalsPanel';
import SessionRecorder from './SessionRecorder';
import BillingPanel from './BillingPanel';
import mammoth from 'mammoth/mammoth.browser';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min?url';
import { 
    X, Mail, AlertTriangle, Calendar, FileText, MessageCircle, Save, Paperclip, 
    Image as ImageIcon, File, Trash2, Download, Plus, Stethoscope, 
    BarChart2, List, Activity, TrendingUp, PieChart, ChevronLeft, CheckSquare, Filter, Mic, Video, User, Upload
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell, LabelList } from 'recharts';

GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PatientDetailModalProps {
  patient: PatientSummary;
  onClose: () => void;
  psychologistId?: string;
}

// Helper to normalize data structure
const normalizeNote = (note?: string | ClinicalNoteContent): ClinicalNoteContent => {
    if (!note) return { text: '', attachments: [] };
    if (typeof note === 'string') return { text: note, attachments: [] };
    return note;
};
const hasFeedbackContent = (note: ClinicalNoteContent) => {
    const textHas = (note.text || '').trim().length > 0;
    const attHas = Array.isArray(note.attachments) && note.attachments.length > 0;
    return textHas || attHas;
};

const feedbackChanged = (prev: ClinicalNoteContent, next: ClinicalNoteContent) => {
    const prevNormalized = {
        text: (prev.text || '').trim(),
        attachments: (prev.attachments || []).map(a => ({ id: a.id, url: a.url, name: a.name, type: a.type }))
    };
    const nextNormalized = {
        text: (next.text || '').trim(),
        attachments: (next.attachments || []).map(a => ({ id: a.id, url: a.url, name: a.name, type: a.type }))
    };
    return JSON.stringify(prevNormalized) !== JSON.stringify(nextNormalized);
};

const isLegacySessionFeedback = (feedback: ClinicalNoteContent, summary: string) => {
    const feedText = (feedback.text || '').trim();
    const sumText = (summary || '').trim();
    if (!feedText) return false;
    if (feedText === sumText) return true;
    const lower = feedText.toLowerCase();
    return lower.includes('resumen de la sesión') || lower.includes('meta terapéutica');
};

const PatientDetailModal: React.FC<PatientDetailModalProps> = ({ patient, onClose, psychologistId: propPsychologistId }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set());
  
  // View State
  const [activeTab, setActiveTab] = useState<'TIMELINE' | 'ANALYTICS' | 'PLAN' | 'INFO' | 'BILLING'>('TIMELINE');
  const [patientUser, setPatientUser] = useState<any>(null);
  const [entryFilter, setEntryFilter] = useState<'ALL' | 'DIARY' | 'INTERNAL' | 'SESSION' | 'FEEDBACK'>('ALL');
  const [currentPsychologistId, setCurrentPsychologistId] = useState<string>(propPsychologistId || '');
  
  // Analytics State
  const [analyticsRange, setAnalyticsRange] = useState<'WEEK' | 'MONTH' | 'YEAR'>('WEEK');

  // Creation Mode State
  const [isCreating, setIsCreating] = useState(false);
  const [newEntryDate, setNewEntryDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });

  // Edit/Create State
    const [internalNote, setInternalNote] = useState<ClinicalNoteContent>({ text: '', attachments: [] });
    const [feedback, setFeedback] = useState<ClinicalNoteContent>({ text: '', attachments: [] });
    const [sessionNote, setSessionNote] = useState<ClinicalNoteContent>({ text: '', attachments: [] });
    const [sessionTranscript, setSessionTranscript] = useState('');
    const [isSessionProcessing, setIsSessionProcessing] = useState(false);
    const [showSessionRecorder, setShowSessionRecorder] = useState(false);
    const [noteType, setNoteType] = useState<'INTERNAL' | 'FEEDBACK' | 'SESSION'>('INTERNAL');
    const [sessionStep, setSessionStep] = useState<1 | 2>(1);
    const [generatedSummary, setGeneratedSummary] = useState('');
    const [generatedGoal, setGeneratedGoal] = useState('');
  
  // Refs for file inputs
    const internalFileInputRef = useRef<HTMLInputElement>(null);
    const feedbackFileInputRef = useRef<HTMLInputElement>(null);
    const sessionTranscriptFileInputRef = useRef<HTMLInputElement>(null);

      const extractTranscriptFromFile = async (file: File): Promise<string> => {
          const name = file.name.toLowerCase();

          if (file.type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
              return (await file.text()).trim();
          }

          const buffer = await file.arrayBuffer();

          if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
              const result = await mammoth.extractRawText({ arrayBuffer: buffer });
              return (result?.value || '').trim();
          }

          if (name.endsWith('.doc') || file.type === 'application/msword') {
              try {
                  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
                  return (result?.value || '').trim();
              } catch {
                  return '';
              }
          }

          if (name.endsWith('.pdf') || file.type === 'application/pdf') {
              const pdf = await getDocument({ data: buffer }).promise;
              let text = '';
              for (let i = 1; i <= pdf.numPages; i += 1) {
                  const page = await pdf.getPage(i);
                  const content = await page.getTextContent();
                  const strings = (content.items as any[])
                    .map(item => (item && typeof item.str === 'string' ? item.str : ''))
                    .join(' ');
                  text += `${strings}\n`;
              }
              return text.trim();
          }

          return '';
      };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Use prop psychologistId if available, otherwise get from localStorage
        if (propPsychologistId) {
          console.log('[PatientDetailModal] Using prop psychologistId:', propPsychologistId);
          setCurrentPsychologistId(propPsychologistId);
        } else {
          const storedUser = localStorage.getItem('currentUser');
          console.log('[PatientDetailModal] storedUser:', storedUser);
          if (storedUser) {
            const userData = JSON.parse(storedUser);
            console.log('[PatientDetailModal] userData:', userData);
            if (userData.id) {
              console.log('[PatientDetailModal] Setting currentPsychologistId:', userData.id);
              setCurrentPsychologistId(userData.id);
            }
          }
        }
        
        const [e, g] = await Promise.all([
          getEntriesForUser(patient.id),
          getGoalsForUser(patient.id)
        ]);
        if (!cancelled) {
          setEntries(e);
          setGoals(g);
        }
        // Load full user info
        try {
          const response = await fetch(`/api/users?id=${patient.id}`);
          if (response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const userData = await response.json();
              if (!cancelled && userData) {
                setPatientUser(userData);
              }
            } else {
              console.warn('Expected JSON but got:', contentType);
            }
          }
        } catch (err) {
          console.error('Error loading patient user info', err);
        }
      } catch (err) {
        console.error('Error loading patient data', err);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [patient.id]);

        const mergeEntryList = (list: JournalEntry[], entry: JournalEntry) => {
            const idx = list.findIndex(e => e.id === entry.id);
            if (idx === -1) return [entry, ...list].sort((a, b) => b.timestamp - a.timestamp);

            const existing = list[idx];
            const merged: JournalEntry = {
            ...entry,
            ...existing,
            psychologistNote: existing.psychologistNote ?? entry.psychologistNote,
            psychologistFeedback: existing.psychologistFeedback ?? entry.psychologistFeedback,
            psychologistFeedbackUpdatedAt: existing.psychologistFeedbackUpdatedAt ?? entry.psychologistFeedbackUpdatedAt,
            psychologistFeedbackReadAt: existing.psychologistFeedbackReadAt ?? entry.psychologistFeedbackReadAt,
            transcript: existing.transcript ?? entry.transcript,
            summary: existing.summary ?? entry.summary,
            advice: existing.advice ?? entry.advice
            };

            const next = [...list];
            next[idx] = merged;
            return next.sort((a, b) => b.timestamp - a.timestamp);
        };

  // Filter entries based on role (Psych sees patient data) and TIME RANGE
  const getFilteredEntries = () => {
      // 1. Only Patient Entries
      const patientEntries = entries.filter(e => e.createdBy !== 'PSYCHOLOGIST');
      
      // 2. Filter by Time Range
      const now = new Date();
      const cutoffDate = new Date();
      
      if (analyticsRange === 'WEEK') {
          cutoffDate.setDate(now.getDate() - 7);
      } else if (analyticsRange === 'MONTH') {
          cutoffDate.setMonth(now.getMonth() - 1);
      } else if (analyticsRange === 'YEAR') {
          cutoffDate.setFullYear(now.getFullYear() - 1);
      }

      // We compare using timestamp for accuracy or date string
      return patientEntries.filter(e => e.timestamp >= cutoffDate.getTime());
  };

  const filteredEntries = getFilteredEntries();
      const patientDiaryEntries = filteredEntries.filter(e => {
          if (e.createdBy === 'PSYCHOLOGIST') return false;
          return Boolean(e.transcript && e.transcript.trim().length > 0);
      });

      const avgSentiment = patientDiaryEntries.length > 0
          ? patientDiaryEntries.reduce((acc, curr) => acc + (curr.sentimentScore || 0), 0) / patientDiaryEntries.length
          : 0;

      const latestDiaryEntry = [...patientDiaryEntries].sort((a, b) => b.timestamp - a.timestamp)[0];

    const psychEntriesCount = entries.filter(e => e.createdBy === 'PSYCHOLOGIST').length;
    const patientEntriesCount = entries.filter(e => e.createdBy !== 'PSYCHOLOGIST').length;
    const lastUpdateDate = entries.length > 0 ? entries[0].date : '—';

  // --- GOAL HANDLERS ---
  const handleAddGoal = (desc: string) => {
      const newGoal: Goal = {
          id: crypto.randomUUID(),
          userId: patient.id,
          description: desc,
          createdAt: Date.now(),
          completed: false,
          aiFeedback: '',
          createdBy: 'PSYCHOLOGIST' // Mark as assigned by Psych
      };
      const updated = [...goals, newGoal];
      setGoals(updated);
      saveUserGoals(patient.id, updated);
  };

  const handleToggleGoal = (id: string) => {
      const updated = goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g);
      setGoals(updated);
      saveUserGoals(patient.id, updated);
  };

  const handleDeleteGoal = (id: string) => {
      if (!window.confirm("¿Eliminar esta tarea?")) return;
      const updated = goals.filter(g => g.id !== id);
      setGoals(updated);
      saveUserGoals(patient.id, updated);
  };

  // --- NOTE HANDLERS ---
  const handleEditClick = (entry: JournalEntry) => {
      setEditingEntryId(entry.id);
      setIsCreating(false);
      setInternalNote(normalizeNote(entry.psychologistNote));
      const nextFeedback = normalizeNote(entry.psychologistFeedback);
      if (entry.psychologistEntryType === 'SESSION' && isLegacySessionFeedback(nextFeedback, entry.summary)) {
          setFeedback({ text: '', attachments: [] });
      } else {
          setFeedback(nextFeedback);
      }
            if (entry.createdBy === 'PSYCHOLOGIST') {
                if (entry.psychologistEntryType === 'SESSION') setNoteType('FEEDBACK');
                else if (entry.psychologistEntryType === 'FEEDBACK') setNoteType('FEEDBACK');
                else setNoteType('INTERNAL');
            } else {
                setNoteType('INTERNAL');
            }
  };

  const toggleTranscript = (id: string) => {
      setExpandedTranscripts(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const handleStartCreate = () => {
      setEditingEntryId(null);
      setInternalNote({ text: '', attachments: [] });
      setFeedback({ text: '', attachments: [] });
      setSessionNote({ text: '', attachments: [] });
      setSessionTranscript('');
      setNoteType('INTERNAL');
      setIsCreating(true);
      setActiveTab('TIMELINE'); // Switch back to timeline to show form
  };

  const handleSaveNotes = async (entry: JournalEntry) => {
            if (entry.psychologistEntryType !== 'SESSION') {
                const hasFeedback = hasFeedbackContent(feedback);
                const internalText = (internalNote.text || '').trim();
                const feedbackText = (feedback.text || '').trim();
                const newPsychEntry: JournalEntry = {
                    id: crypto.randomUUID(),
                    userId: patient.id,
                    date: entry.date,
                    timestamp: Date.now(),
                    transcript: '',
                    summary: noteType === 'FEEDBACK'
                        ? (feedbackText || 'Feedback del especialista')
                        : (internalText || 'Nota interna del especialista'),
                    sentimentScore: 5,
                    emotions: ['Clínico'],
                    advice: noteType === 'FEEDBACK'
                        ? 'Revisa el feedback de tu especialista.'
                        : 'Revisa las notas de tu especialista.',
                    psychologistNote: internalNote,
                    psychologistFeedback: noteType === 'FEEDBACK' ? feedback : undefined,
                    psychologistFeedbackUpdatedAt: hasFeedback ? Date.now() : undefined,
                    psychologistFeedbackReadAt: hasFeedback ? undefined : undefined,
                    createdBy: 'PSYCHOLOGIST',
                    psychologistEntryType: noteType === 'FEEDBACK' ? 'FEEDBACK' : 'NOTE'
                };

                const prevEntries = entries;
                setEntries(prev => [newPsychEntry, ...prev]);
                setEditingEntryId(null);

                try {
                    await saveEntry(newPsychEntry);
                    const e = await getEntriesForUser(patient.id);
                    setEntries(mergeEntryList(e, newPsychEntry));
                } catch (err) {
                    console.error('Error creating psych entry', err);
                    setEntries(prevEntries);
                }
                return;
            }

            const prevFeedback = normalizeNote(entry.psychologistFeedback);
            const nextFeedback = feedback;
            const hasFeedback = hasFeedbackContent(nextFeedback);
            const prevHasFeedback = hasFeedbackContent(prevFeedback);
            const didChangeFeedback = feedbackChanged(prevFeedback, nextFeedback);
            const feedbackUpdatedAt = hasFeedback
                ? (didChangeFeedback || !prevHasFeedback ? Date.now() : entry.psychologistFeedbackUpdatedAt)
                : undefined;
            const feedbackReadAt = hasFeedback
                ? (didChangeFeedback || !prevHasFeedback ? undefined : entry.psychologistFeedbackReadAt)
                : undefined;

            const updated: JournalEntry = {
                    ...entry,
                    psychologistNote: internalNote,
                    psychologistFeedback: feedback,
                    psychologistFeedbackUpdatedAt: feedbackUpdatedAt,
                    psychologistFeedbackReadAt: feedbackReadAt,
                    psychologistEntryType: entry.psychologistEntryType === 'SESSION'
                        ? 'SESSION'
                        : entry.createdBy === 'PSYCHOLOGIST'
                            ? (noteType === 'FEEDBACK' ? 'FEEDBACK' : 'NOTE')
                            : entry.psychologistEntryType
            };
            const prevEntries = entries;

            setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));
            setEditingEntryId(null);

            try {
                await updateEntry(updated);
            } catch (err) {
                console.error('Error saving notes', err);
                setEntries(prevEntries);
            }
  };

  const handleCreateEntry = async () => {
      if (noteType === 'SESSION') {
          if (sessionStep === 1) {
              // Step 1: Validate and generate summary
              if (!sessionTranscript.trim()) {
                  alert('Añade un transcript para analizar la sesión.');
                  return;
              }
              setIsSessionProcessing(true);
              try {
                  const [{ sessionSummary, sessionGoal }] = await Promise.all([
                      analyzeClinicalSession(sessionTranscript, newEntryDate)
                  ]);
                  setGeneratedSummary(sessionSummary);
                  setGeneratedGoal(sessionGoal);
                  setSessionStep(2);
              } catch (err) {
                  console.error('Error analyzing session', err);
                  alert('Error al analizar la sesión. Intenta de nuevo.');
              } finally {
                  setIsSessionProcessing(false);
              }
              return;
          }

          // Step 2: Save the session entry
          if (sessionStep === 2) {
              setIsSessionProcessing(true);
              try {
                  const diaryAnalysis = await analyzeJournalEntry(sessionTranscript, newEntryDate, patient.id);
                  const hasSessionFeedback = hasFeedbackContent(feedback);
                  const sessionInternal: ClinicalNoteContent = {
                      text: internalNote.text,
                      attachments: [...(internalNote.attachments || []), ...(sessionNote.attachments || [])]
                  };
                  const newEntry: JournalEntry = {
                      id: crypto.randomUUID(),
                      userId: patient.id,
                      date: newEntryDate,
                      timestamp: Date.now(),
                      transcript: sessionTranscript,
                      summary: generatedSummary,
                      sentimentScore: diaryAnalysis.sentimentScore || 5,
                      emotions: diaryAnalysis.emotions || ['Sesión'],
                      structuredEmotions: diaryAnalysis.structuredEmotions || [],
                      advice: generatedGoal,
                      psychologistNote: sessionInternal,
                      psychologistFeedback: hasSessionFeedback ? feedback : undefined,
                      psychologistFeedbackUpdatedAt: hasSessionFeedback ? Date.now() : undefined,
                      psychologistFeedbackReadAt: hasSessionFeedback ? undefined : undefined,
                      createdBy: 'PSYCHOLOGIST',
                      psychologistEntryType: 'SESSION'
                  };

                  const prevEntries = entries;
                  setEntries([newEntry, ...entries]);
                  setIsCreating(false);

                  try {
                      await saveEntry(newEntry);
                      const e = await getEntriesForUser(patient.id);
                      setEntries(mergeEntryList(e, newEntry));
                  } catch (err) {
                      console.error('Error creating session entry', err);
                      setEntries(prevEntries);
                      alert('No se pudo guardar la sesión.');
                  } finally {
                      setIsSessionProcessing(false);
                      setInternalNote({ text: '', attachments: [] });
                      setFeedback({ text: '', attachments: [] });
                      setSessionNote({ text: '', attachments: [] });
                      setSessionTranscript('');
                      setGeneratedSummary('');
                      setGeneratedGoal('');
                      setSessionStep(1);
                  }
                  return;
              } catch (err) {
                  console.error('Error saving session', err);
                  alert('Error al guardar la sesión.');
                  setIsSessionProcessing(false);
                  return;
              }
          }
      }

      const hasFeedback = hasFeedbackContent(feedback);
      const newEntry: JournalEntry = {
          id: crypto.randomUUID(),
          userId: patient.id,
          date: newEntryDate,
          timestamp: Date.now(),
          transcript: '', 
          summary: 'Sesión Clínica / Nota del Especialista',
          sentimentScore: 5, 
          emotions: ['Clínico'],
          advice: 'Revisa las notas de tu especialista.',
          psychologistNote: internalNote,
          psychologistFeedback: feedback,
          psychologistFeedbackUpdatedAt: hasFeedback ? Date.now() : undefined,
          psychologistFeedbackReadAt: hasFeedback ? undefined : undefined,
          createdBy: 'PSYCHOLOGIST',
          psychologistEntryType: noteType === 'FEEDBACK' ? 'FEEDBACK' : 'NOTE'
      };
            const prevEntries = entries;
            setEntries([newEntry, ...entries]);
            setIsCreating(false);

      try {
        await saveEntry(newEntry);
        const e = await getEntriesForUser(patient.id);
                setEntries(mergeEntryList(e, newEntry));
      } catch (err) {
        console.error('Error creating entry', err);
                setEntries(prevEntries);
      } finally {
                setIsCreating(false);
      }
  };

  const handleDeletePsychEntry = async (entryId: string) => {
      if (!window.confirm('¿Eliminar esta entrada clínica?')) return;
      const prev = entries;
      setEntries(prev.filter(e => e.id !== entryId));
      try {
          await deleteEntry(entryId);
      } catch (err) {
          console.error('Error deleting entry', err);
          alert('No se pudo eliminar la entrada.');
          setEntries(prev);
      }
  };


    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'INTERNAL' | 'FEEDBACK') => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
          const base64 = reader.result as string;
          const newAttachment: Attachment = {
              id: crypto.randomUUID(),
              type: file.type.startsWith('image/') ? 'IMAGE' : file.type.startsWith('audio/') ? 'AUDIO' : file.type.startsWith('video/') ? 'VIDEO' : 'DOCUMENT',
              url: base64,
              name: file.name
          };

          if (target === 'INTERNAL') {
              setInternalNote(prev => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
          } else {
              setFeedback(prev => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
          }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const handleSessionTranscriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const text = await extractTranscriptFromFile(file);
          if (text) {
              setSessionTranscript(prev => (prev ? `${prev}\n${text}` : text));
          } else {
              alert('No se pudo extraer texto del archivo. Puedes pegar el transcript manualmente.');
          }
      } catch (err) {
          console.error('Transcript extraction failed', err);
          alert('No se pudo leer el transcript.');
      }

      const reader = new FileReader();
      reader.onloadend = () => {
          const base64 = reader.result as string;
          const newAttachment: Attachment = {
              id: crypto.randomUUID(),
              type: 'DOCUMENT',
              url: base64,
              name: file.name
          };
          setSessionNote(prev => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  // Unified handler for session file uploads (drag & drop or click)
  const handleSessionFileUpload = async (file: File) => {
      if (!file) return;

      try {
          const fileType = file.type;
          let attachmentType: 'AUDIO' | 'VIDEO' | 'DOCUMENT' = 'DOCUMENT';

          // Determine attachment type
          if (fileType.startsWith('audio/')) {
              attachmentType = 'AUDIO';
          } else if (fileType.startsWith('video/')) {
              attachmentType = 'VIDEO';
          } else if (
              fileType.includes('text') ||
              fileType.includes('pdf') ||
              fileType.includes('document') ||
              file.name.match(/\.(txt|md|doc|docx|pdf)$/i)
          ) {
              attachmentType = 'DOCUMENT';
              // Try to extract text from document
              try {
                  const text = await extractTranscriptFromFile(file);
                  if (text) {
                      setSessionTranscript(prev => (prev ? `${prev}\n\n--- ${file.name} ---\n${text}` : text));
                  }
              } catch (err) {
                  console.error('Could not extract text from document:', err);
              }
          }

          // Create attachment
          const reader = new FileReader();
          reader.onloadend = () => {
              const base64 = reader.result as string;
              const newAttachment: Attachment = {
                  id: crypto.randomUUID(),
                  type: attachmentType,
                  url: base64,
                  name: file.name
              };
              setSessionNote(prev => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
          };
          reader.onerror = () => {
              console.error('Error reading file:', reader.error);
              alert('Error al leer el archivo');
          };
          reader.readAsDataURL(file);
      } catch (err) {
          console.error('Error uploading file:', err);
          alert('Error al subir el archivo');
      }
  };

  const removeAttachment = (id: string, target: 'INTERNAL' | 'FEEDBACK' | 'SESSION') => {
      if (target === 'INTERNAL') {
          setInternalNote(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== id) }));
      } else if (target === 'FEEDBACK') {
          setFeedback(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== id) }));
      } else {
          setSessionNote(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== id) }));
      }
  };

  // --- ANALYTICS DATA PREP ---
  const chartData = [...filteredEntries]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(e => ({
      date: e.date.substring(5), // MM-DD
      score: e.sentimentScore
    }));

  // Aggregation Logic
  const emotionStats: Record<string, { count: number, parent: string }> = {};
  
  filteredEntries.forEach(e => {
      if (e.structuredEmotions && e.structuredEmotions.length > 0) {
          e.structuredEmotions.forEach(em => {
              const name = em.level2 || em.level1;
              const parent = em.level1; 
              if (!emotionStats[name]) {
                  emotionStats[name] = { count: 0, parent };
              }
              emotionStats[name].count += 1;
          });
      } else {
          e.emotions.forEach(em => {
              if (em !== 'Clínico') {
                  if (!emotionStats[em]) {
                      emotionStats[em] = { count: 0, parent: em };
                  }
                  emotionStats[em].count += 1;
              }
          });
      }
  });

  const getEmotionColor = (name: string) => {
      const n = name.toLowerCase();
      if (n.includes('alegr') || n.includes('joy') || n.includes('felici')) return '#fbbf24'; 
      if (n.includes('amor') || n.includes('love')) return '#ec4899'; 
      if (n.includes('trist') || n.includes('sad')) return '#60a5fa'; 
      if (n.includes('ira') || n.includes('ang')) return '#f87171'; 
      if (n.includes('mied') || n.includes('fear')) return '#a78bfa'; 
      if (n.includes('sorp') || n.includes('surp')) return '#34d399'; 
      return '#94a3b8';
  };
  
  // Sorted but NOT SLICED (User requested all names)
  const emotionData = Object.entries(emotionStats)
      .map(([name, stat]) => ({ name, count: stat.count, fill: getEmotionColor(stat.parent) }))
      .sort((a, b) => b.count - a.count);

  // Dynamic Height for Bar Chart based on number of emotions to prevent squashing
  const barChartHeight = Math.max(250, emotionData.length * 50);

  return (
    // FULL SCREEN OVERLAY - Uses 100dvh for dynamic viewport height on mobile
    <div className="fixed top-0 left-0 w-screen h-[100dvh] bg-white z-[9999] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* HEADER */}
        <div className="bg-white border-b border-slate-200 shrink-0 shadow-sm z-20">
            <div className="px-4 py-3 flex justify-between items-center">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button onClick={onClose} className="md:hidden text-slate-500 hover:text-slate-800 -ml-2 p-1">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm md:text-lg shrink-0">
                        {patient.name.charAt(0)}
                    </div>
                    <div className="overflow-hidden">
                        <h2 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2 truncate">
                            {patient.name}
                            {patient.riskLevel === 'HIGH' && (
                                <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold border border-red-200 shrink-0">
                                    Riesgo Alto
                                </span>
                            )}
                        </h2>
                        <p className="text-xs text-slate-500 truncate">{patient.email}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleStartCreate}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 md:px-4 md:py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                        title="Nueva Nota"
                    >
                        <Plus size={20} /> <span className="hidden md:inline">Nueva Entrada</span>
                    </button>
                    <button onClick={onClose} className="hidden md:block p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-red-500">
                        <X size={28} />
                    </button>
                </div>
            </div>

            {/* Sub-Header Tabs */}
            <div className="flex px-4 pb-0 md:px-6 overflow-x-auto">
                 <button 
                     onClick={() => setActiveTab('TIMELINE')}
                     className={`flex-1 md:flex-none pb-3 pt-1 text-sm font-medium border-b-2 transition-colors flex justify-center md:justify-start gap-2 whitespace-nowrap ${activeTab === 'TIMELINE' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
                 >
                     <List size={16} /> <span className="hidden sm:inline">Historia Clínica</span><span className="sm:hidden">Historia</span>
                 </button>
                 <button 
                     onClick={() => setActiveTab('ANALYTICS')}
                     className={`flex-1 md:flex-none md:ml-6 pb-3 pt-1 text-sm font-medium border-b-2 transition-colors flex justify-center md:justify-start gap-2 whitespace-nowrap ${activeTab === 'ANALYTICS' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
                 >
                     <BarChart2 size={16} /> Analíticas
                 </button>
                 <button 
                     onClick={() => setActiveTab('PLAN')}
                     className={`flex-1 md:flex-none md:ml-6 pb-3 pt-1 text-sm font-medium border-b-2 transition-colors flex justify-center md:justify-start gap-2 whitespace-nowrap ${activeTab === 'PLAN' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
                 >
                     <CheckSquare size={16} /> Plan
                 </button>
                 <button 
                     onClick={() => setActiveTab('INFO')}
                     className={`flex-1 md:flex-none md:ml-6 pb-3 pt-1 text-sm font-medium border-b-2 transition-colors flex justify-center md:justify-start gap-2 whitespace-nowrap ${activeTab === 'INFO' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
                 >
                     <User size={16} /> <span className="hidden sm:inline">Información Personal</span><span className="sm:hidden">Info</span>
                 </button>
                 <button 
                     onClick={() => setActiveTab('BILLING')}
                     className={`flex-1 md:flex-none md:ml-6 pb-3 pt-1 text-sm font-medium border-b-2 transition-colors flex justify-center md:justify-start gap-2 whitespace-nowrap ${activeTab === 'BILLING' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
                 >
                     <FileText size={16} /> Facturación
                 </button>
            </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative bg-white">
            
            {activeTab === 'TIMELINE' ? (
                <div className="flex h-full flex-col md:flex-row">
                    {/* Left: Timeline Feed */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 md:pb-8">

                        {/* Timeline Summary */}
                        <div className="mb-6 md:mb-8">
                            <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 border border-indigo-100 rounded-2xl p-4 md:p-6 shadow-sm">
                                <div className="flex items-start justify-between gap-3 mb-4">
                                    <div>
                                        <h3 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2">
                                            <FileText size={18} className="text-indigo-500" />
                                            Historial Clínico
                                        </h3>
                                        <p className="text-xs md:text-sm text-slate-500 mt-1">
                                            Última actualización: <span className="font-semibold text-slate-700">{lastUpdateDate}</span>
                                        </p>
                                    </div>
                                    <div className="hidden md:flex items-center gap-2 text-[10px] font-semibold text-indigo-600 bg-white border border-indigo-100 px-2 py-1 rounded-full">
                                        Vista Psicólogo
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="bg-white/80 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Total Entradas</p>
                                            <p className="text-2xl font-bold text-slate-800">{entries.length}</p>
                                        </div>
                                        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-full"><FileText size={16} /></div>
                                    </div>
                                    <div className="bg-white/80 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Notas Clínicas</p>
                                            <p className="text-2xl font-bold text-slate-800">{psychEntriesCount}</p>
                                        </div>
                                        <div className="bg-purple-50 text-purple-600 p-2 rounded-full"><Stethoscope size={16} /></div>
                                    </div>
                                    <div className="bg-white/80 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Registros Paciente</p>
                                            <p className="text-2xl font-bold text-slate-800">{patientEntriesCount}</p>
                                        </div>
                                        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-full"><Calendar size={16} /></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Creation Form */}
                        {isCreating && (
                            <div className="mb-6 bg-white p-4 md:p-6 rounded-xl border border-indigo-200 shadow-lg animate-in slide-in-from-top-4">
                                <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                                    <h4 className="font-bold text-indigo-800 flex items-center gap-2 text-base md:text-lg">
                                        <Stethoscope size={20} /> Nueva Entrada
                                    </h4>
                                    <input 
                                        type="date" 
                                        value={newEntryDate}
                                        onChange={(e) => setNewEntryDate(e.target.value)}
                                        className="text-sm bg-white border border-slate-300 text-slate-900 rounded px-2 py-1 font-medium shadow-sm"
                                    />
                                </div>

                                <div className="flex flex-col gap-4 md:gap-6">
                                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 w-fit">
                                        <button
                                            type="button"
                                            onClick={() => setNoteType('INTERNAL')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${noteType === 'INTERNAL' ? 'bg-white text-amber-700 shadow-sm border border-amber-100' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <FileText size={12} /> Nota Interna
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNoteType('FEEDBACK')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${noteType === 'FEEDBACK' ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <MessageCircle size={12} /> Feedback Paciente
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNoteType('SESSION')}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${noteType === 'SESSION' ? 'bg-white text-purple-700 shadow-sm border border-purple-100' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <Stethoscope size={12} /> Sesión
                                        </button>
                                    </div>

                                    {noteType === 'INTERNAL' ? (
                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                                    <FileText size={12} /> Nota Interna
                                                </label>
                                                <button type="button" onClick={() => internalFileInputRef.current?.click()} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                                                    <Paperclip size={12} /> <span className="hidden sm:inline">Adjuntar</span>
                                                </button>
                                                <input type="file" ref={internalFileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'INTERNAL')} accept="image/*,application/pdf" />
                                            </div>
                                            <textarea 
                                                className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none shadow-sm"
                                                rows={4}
                                                value={internalNote.text}
                                                onChange={(e) => setInternalNote(prev => ({...prev, text: e.target.value}))}
                                                placeholder="Notas privadas..."
                                            />
                                            {internalNote.attachments.length > 0 && (
                                                <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                                                    {internalNote.attachments.map(att => (
                                                        <div key={att.id} className="relative group/att shrink-0 w-10 h-10">
                                                            <img src={att.url} alt="att" className="w-full h-full rounded object-cover border border-slate-200" />
                                                            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAttachment(att.id, 'INTERNAL'); }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={8} /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : noteType === 'FEEDBACK' ? (
                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                                                    <MessageCircle size={12} /> Feedback Paciente
                                                </label>
                                                <button type="button" onClick={() => feedbackFileInputRef.current?.click()} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                                                    <Paperclip size={12} /> <span className="hidden sm:inline">Adjuntar</span>
                                                </button>
                                                <input type="file" ref={feedbackFileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'FEEDBACK')} accept="image/*,application/pdf" />
                                            </div>
                                            <textarea 
                                                className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm"
                                                rows={4}
                                                value={feedback.text}
                                                onChange={(e) => setFeedback(prev => ({...prev, text: e.target.value}))}
                                                placeholder="Instrucciones para el paciente..."
                                            />
                                            {feedback.attachments.length > 0 && (
                                                <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                                                    {feedback.attachments.map(att => (
                                                        <div key={att.id} className="relative group/att shrink-0 w-10 h-10">
                                                            <img src={att.url} alt="att" className="w-full h-full rounded object-cover border border-slate-200" />
                                                            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAttachment(att.id, 'FEEDBACK'); }} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={8} /></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Step Indicator */}
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${sessionStep === 1 ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'}`}>
                                                    1
                                                </div>
                                                <div className={`h-0.5 flex-1 ${sessionStep === 2 ? 'bg-purple-600' : 'bg-slate-200'}`}></div>
                                                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${sessionStep === 2 ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                                    2
                                                </div>
                                            </div>

                                            {sessionStep === 1 ? (
                                                <>
                                                    {/* Step 1: Upload or Paste Transcript */}
                                                    <div className="text-center mb-4">
                                                        <h4 className="text-lg font-bold text-slate-800">Paso 1: Transcript de la sesión</h4>
                                                        <p className="text-sm text-slate-500 mt-1">Sube un archivo o pega el texto del transcript</p>
                                                    </div>

                                                    {/* Drag & Drop File Upload Box */}
                                                    <div
                                                        onDragOver={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            e.currentTarget.classList.add('border-purple-500', 'bg-purple-50');
                                                        }}
                                                        onDragLeave={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            e.currentTarget.classList.remove('border-purple-500', 'bg-purple-50');
                                                        }}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            e.currentTarget.classList.remove('border-purple-500', 'bg-purple-50');
                                                            
                                                            const files = Array.from(e.dataTransfer.files);
                                                            if (files.length > 0) {
                                                                handleSessionFileUpload(files[0]).catch(err => {
                                                                    console.error('Error handling file drop:', err);
                                                                });
                                                            }
                                                        }}
                                                        className="border-2 border-dashed border-slate-300 rounded-lg p-6 transition-all hover:border-purple-400 hover:bg-purple-50/50"
                                                    >
                                                        <input
                                                            id="session-file-upload"
                                                            type="file"
                                                            className="hidden"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    const fileToProcess = file;
                                                                    e.target.value = '';
                                                                    
                                                                    handleSessionFileUpload(fileToProcess).catch(err => {
                                                                        console.error('Error handling file upload:', err);
                                                                        alert('Error al procesar el archivo');
                                                                    });
                                                                }
                                                                return false;
                                                            }}
                                                            accept="audio/*,video/*,.txt,.TXT,.md,.MD,.doc,.docx,.pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/*"
                                                        />
                                                        <label htmlFor="session-file-upload" className="flex flex-col items-center gap-3 text-center cursor-pointer">
                                                            <div className="flex items-center justify-center gap-2 text-purple-600">
                                                                <Upload size={24} />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-semibold text-slate-700">
                                                                    Subir documento
                                                                </p>
                                                                <p className="text-xs text-slate-500 mt-1">
                                                                    Audio, Video, o Documentos (.txt, .md, .doc, .docx, .pdf)
                                                                </p>
                                                            </div>
                                                            {sessionNote.attachments.length > 0 && (
                                                                <div className="flex flex-wrap gap-2 mt-2">
                                                                    {sessionNote.attachments.map(att => (
                                                                        <div key={att.id} className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                                                                            {att.type === 'AUDIO' && <Mic size={12} />}
                                                                            {att.type === 'VIDEO' && <Video size={12} />}
                                                                            {att.type === 'DOCUMENT' && <FileText size={12} />}
                                                                            <span className="max-w-[150px] truncate">{att.name}</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    removeAttachment(att.id, 'SESSION');
                                                                                }}
                                                                                className="hover:text-purple-900"
                                                                            >
                                                                                <X size={12} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </label>
                                                    </div>

                                                    <div className="text-center text-sm text-slate-500 font-medium">
                                                        o
                                                    </div>

                                                    <div>
                                                        <label className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                                                            <MessageCircle size={12} /> Pegar Transcript
                                                        </label>
                                                        <textarea
                                                            className="mt-2 w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none shadow-sm"
                                                            rows={8}
                                                            value={sessionTranscript}
                                                            onChange={(e) => setSessionTranscript(e.target.value)}
                                                            placeholder="Pega aquí el transcript de la sesión..."
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    {/* Step 2: Review AI Summary */}
                                                    <div className="text-center mb-4">
                                                        <h4 className="text-lg font-bold text-slate-800">Paso 2: Resumen generado por IA</h4>
                                                        <p className="text-sm text-slate-500 mt-1">Revisa y ajusta el resumen antes de guardar</p>
                                                    </div>

                                                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                                        <label className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-2 block">
                                                            📝 Resumen de la sesión
                                                        </label>
                                                        <textarea
                                                            className="w-full p-3 text-sm border border-purple-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-purple-500 outline-none"
                                                            rows={6}
                                                            value={generatedSummary}
                                                            onChange={(e) => setGeneratedSummary(e.target.value)}
                                                        />
                                                    </div>

                                                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                                        <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2 block">
                                                            🎯 Objetivo / Recomendación
                                                        </label>
                                                        <textarea
                                                            className="w-full p-3 text-sm border border-indigo-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                            rows={4}
                                                            value={generatedGoal}
                                                            onChange={(e) => setGeneratedGoal(e.target.value)}
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div>
                                                            <div className="flex justify-between items-center mb-1">
                                                                <label className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                                                    <FileText size={12} /> Nota Interna
                                                                </label>
                                                                <button type="button" onClick={() => internalFileInputRef.current?.click()} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                                                                    <Paperclip size={12} /> Adjuntar
                                                                </button>
                                                                <input type="file" ref={internalFileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'INTERNAL')} accept="image/*,application/pdf,audio/*,video/*" />
                                                            </div>
                                                            <textarea
                                                                className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none shadow-sm"
                                                                rows={3}
                                                                value={internalNote.text}
                                                                onChange={(e) => setInternalNote(prev => ({...prev, text: e.target.value}))}
                                                                placeholder="Notas internas sobre la sesión..."
                                                            />
                                                        </div>
                                                        <div>
                                                            <div className="flex justify-between items-center mb-1">
                                                                <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                                                                    <MessageCircle size={12} /> Feedback al paciente
                                                                </label>
                                                                <button type="button" onClick={() => feedbackFileInputRef.current?.click()} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                                                                    <Paperclip size={12} /> Adjuntar
                                                                </button>
                                                                <input type="file" ref={feedbackFileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'FEEDBACK')} accept="image/*,application/pdf,audio/*,video/*" />
                                                            </div>
                                                            <textarea
                                                                className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm"
                                                                rows={3}
                                                                value={feedback.text}
                                                                onChange={(e) => setFeedback(prev => ({...prev, text: e.target.value}))}
                                                                placeholder="Feedback para el paciente..."
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                                    {noteType === 'SESSION' && sessionStep === 2 && (
                                        <button 
                                            type="button"
                                            onClick={() => setSessionStep(1)} 
                                            className="px-5 py-2.5 text-sm text-slate-600 hover:text-slate-800 font-medium bg-slate-100 rounded-lg"
                                        >
                                            ← Volver
                                        </button>
                                    )}
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setIsCreating(false);
                                            setSessionStep(1);
                                            setGeneratedSummary('');
                                            setGeneratedGoal('');
                                            setSessionTranscript('');
                                            setInternalNote({ text: '', attachments: [] });
                                            setFeedback({ text: '', attachments: [] });
                                            setSessionNote({ text: '', attachments: [] });
                                        }} 
                                        className="px-5 py-2.5 text-sm text-slate-600 hover:text-slate-800 font-medium bg-slate-100 rounded-lg"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={handleCreateEntry} 
                                        disabled={isSessionProcessing} 
                                        className={`px-5 py-2.5 text-sm rounded-lg flex items-center justify-center gap-2 shadow-md font-medium ${isSessionProcessing ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                    >
                                        {isSessionProcessing ? (
                                            <>⏳ Procesando...</>
                                        ) : noteType === 'SESSION' && sessionStep === 1 ? (
                                            <>✨ Generar Resumen con IA</>
                                        ) : (
                                            <><Save size={18} /> Guardar Entrada</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {entries.length === 0 && !isCreating ? (
                            <div className="text-center py-20 flex flex-col items-center">
                                <div className="w-full max-w-md bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                                    <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4 mx-auto">
                                        <FileText size={24} className="text-indigo-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-700">Historia Clínica Vacía</h3>
                                    <p className="text-slate-500 mt-2 text-sm">No hay registros aún. Crea una nota para iniciar el historial clínico.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="relative w-full">
                                {/* Filter Buttons */}
                                <div className="mb-6 flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-2 shadow-sm flex-wrap">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2">Filtrar:</span>
                                    <button
                                        onClick={() => setEntryFilter('ALL')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                            entryFilter === 'ALL'
                                                ? 'bg-slate-700 text-white shadow-sm'
                                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                                        }`}
                                    >
                                        Todas
                                    </button>
                                    <button
                                        onClick={() => setEntryFilter('DIARY')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                                            entryFilter === 'DIARY'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'
                                        }`}
                                    >
                                        <Calendar size={12} /> Entradas de Diario
                                    </button>
                                    <button
                                        onClick={() => setEntryFilter('INTERNAL')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                                            entryFilter === 'INTERNAL'
                                                ? 'bg-amber-600 text-white shadow-sm'
                                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                        }`}
                                    >
                                        <FileText size={12} /> Notas Internas
                                    </button>
                                    <button
                                        onClick={() => setEntryFilter('SESSION')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                                            entryFilter === 'SESSION'
                                                ? 'bg-purple-600 text-white shadow-sm'
                                                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                                        }`}
                                    >
                                        <Stethoscope size={12} /> Sesiones Terapéuticas
                                    </button>
                                    <button
                                        onClick={() => setEntryFilter('FEEDBACK')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                                            entryFilter === 'FEEDBACK'
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                                        }`}
                                    >
                                        <MessageCircle size={12} /> Feedback
                                    </button>
                                </div>

                                <div className="absolute top-0 bottom-0 left-4 w-px bg-gradient-to-b from-transparent via-slate-200 to-transparent"></div>

                                <div className="space-y-4">
                                    {entries.filter(entry => {
                                        if (entryFilter === 'ALL') return true;
                                        if (entryFilter === 'DIARY') return entry.createdBy !== 'PSYCHOLOGIST';
                                        if (entryFilter === 'SESSION') return entry.createdBy === 'PSYCHOLOGIST' && entry.psychologistEntryType === 'SESSION';
                                        if (entryFilter === 'INTERNAL') return entry.createdBy === 'PSYCHOLOGIST' && entry.psychologistEntryType === 'INTERNAL';
                                        if (entryFilter === 'FEEDBACK') return entry.createdBy === 'PSYCHOLOGIST' && entry.psychologistEntryType === 'FEEDBACK';
                                        return true;
                                    }).map((entry) => {
                                        const pNote = normalizeNote(entry.psychologistNote);
                                        const pFeed = normalizeNote(entry.psychologistFeedback);
                                        const isEditing = editingEntryId === entry.id;
                                        const isPsychEntry = entry.createdBy === 'PSYCHOLOGIST';
                                        const psychEntryLabel = entry.psychologistEntryType === 'SESSION' ? 'Sesión Clínica' : 'Nota Clínica';
                                        const isSession = entry.psychologistEntryType === 'SESSION';
                                        const timeLabel = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                        const hasAttachments = (pNote.attachments?.length || 0) + (pFeed.attachments?.length || 0) > 0;
                                        const feedText = (pFeed.text || '').trim();
                                        const summaryText = (entry.summary || '').trim();
                                        const feedbackDisplayText = feedText || (entry.psychologistEntryType === 'FEEDBACK' ? summaryText : '');
                                        const isLegacySessionFeedback = isSession && feedText && (
                                            feedText === summaryText ||
                                            feedText.toLowerCase().includes('resumen de la sesión') ||
                                            feedText.toLowerCase().includes('meta terapéutica')
                                        );
                                        const showSessionFeedback = isSession
                                            ? ((feedText && !isLegacySessionFeedback) || (pFeed.attachments?.length || 0) > 0)
                                            : ((feedbackDisplayText.length > 0) || (pFeed.attachments?.length || 0) > 0);

                                        return (
                                            <div key={entry.id} className="relative pl-10">
                                                <div className={`absolute left-0 top-6 w-3 h-3 rounded-full border-4 border-white shadow-sm ${isPsychEntry ? 'bg-purple-400' : 'bg-indigo-400'}`}></div>

                                                <div className={`bg-white rounded-2xl border shadow-sm p-4 md:p-6 ${isPsychEntry ? 'border-purple-100 ring-1 ring-purple-50' : 'border-slate-200'} relative overflow-hidden`}>
                                                    <div className={`absolute inset-x-0 top-0 h-1 ${isPsychEntry ? 'bg-gradient-to-r from-purple-400 to-indigo-400' : 'bg-gradient-to-r from-indigo-400 to-sky-400'}`}></div>

                                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                                                        <div className="flex items-center gap-2">
                                                            <time className="text-base md:text-lg font-bold text-slate-800">{entry.date}</time>
                                                            {timeLabel && (
                                                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                                                    {timeLabel}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            {isPsychEntry ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] text-purple-700 font-bold uppercase tracking-wider bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                                                                    <Stethoscope size={10} /> {psychEntryLabel}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 font-bold uppercase tracking-wider bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                                                    <Calendar size={10} /> Diario del Paciente
                                                                </span>
                                                            )}
                                                            {(!isPsychEntry || entry.psychologistEntryType === 'SESSION') && (
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${entry.sentimentScore >= 7 ? 'bg-green-50 text-green-700 border-green-200' : entry.sentimentScore >= 4 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                                    {entry.sentimentScore}/10
                                                                </span>
                                                            )}
                                                            {hasAttachments && (
                                                                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                                                    Adjuntos
                                                                </span>
                                                            )}
                                                            {!isEditing && (
                                                                <button onClick={() => handleEditClick(entry)} className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full hover:bg-indigo-100 transition-colors">
                                                                    {isPsychEntry ? (isSession ? 'Añadir nota' : 'Editar') : 'Añadir Nota'}
                                                                </button>
                                                            )}
                                                            {isPsychEntry && !isEditing && (
                                                                <button onClick={() => handleDeletePsychEntry(entry.id)} className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full hover:bg-red-100 transition-colors">
                                                                    Eliminar
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                {/* Patient Summary */}
                                                {!isPsychEntry && (
                                                    <div className="mb-4">
                                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                                            <h5 className="text-[10px] font-bold uppercase text-slate-400 mb-1">Resumen del paciente</h5>
                                                            <p className="text-slate-700 text-sm md:text-base leading-relaxed">{entry.summary}</p>
                                                        </div>
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {entry.emotions.map((em, idx) => (
                                                                <span key={`${em}-${idx}`} className="text-[10px] bg-white text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-semibold shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]">
                                                                    {em}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {isPsychEntry && entry.psychologistEntryType === 'SESSION' && (
                                                    <div className="mb-4">
                                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                                            <h5 className="text-[10px] font-bold uppercase text-slate-400 mb-1">Resumen de la sesión (IA)</h5>
                                                            <p className="text-slate-700 text-sm md:text-base leading-relaxed">{entry.summary}</p>
                                                        </div>
                                                        {entry.emotions?.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                                {entry.emotions.map((em, idx) => (
                                                                    <span key={`${em}-${idx}`} className="text-[10px] bg-white text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-semibold shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]">
                                                                        {em}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {entry.transcript && entry.transcript.trim().length > 0 && (
                                                            <div className="mt-3">
                                                                <button
                                                                    onClick={() => toggleTranscript(entry.id)}
                                                                    className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full hover:bg-indigo-100 transition-colors"
                                                                >
                                                                    {expandedTranscripts.has(entry.id) ? 'Ocultar transcript' : 'Ver transcript completo'}
                                                                </button>
                                                                {expandedTranscripts.has(entry.id) && (
                                                                    <div className="mt-2 p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                                                                        {entry.transcript}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Editor Mode */}
                                                {isEditing ? (
                                                    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in fade-in">
                                                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 w-fit">
                                                            <button
                                                                onClick={() => setNoteType('INTERNAL')}
                                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${noteType === 'INTERNAL' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'text-slate-500 hover:text-slate-700'}`}
                                                            >
                                                                <FileText size={12} /> Nota Interna
                                                            </button>
                                                            <button
                                                                onClick={() => setNoteType('FEEDBACK')}
                                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${noteType === 'FEEDBACK' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-500 hover:text-slate-700'}`}
                                                            >
                                                                <MessageCircle size={12} /> Feedback
                                                            </button>
                                                        </div>

                                                        {noteType === 'INTERNAL' ? (
                                                            <div>
                                                                <label className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1 mb-1">
                                                                    <FileText size={12} /> Nota Interna
                                                                </label>
                                                                <textarea 
                                                                    className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                                                                    rows={3}
                                                                    value={internalNote.text}
                                                                    onChange={(e) => setInternalNote(prev => ({...prev, text: e.target.value}))}
                                                                />
                                                                {(internalNote.text || internalNote.attachments.length > 0) && (
                                                                    <button
                                                                        onClick={() => setInternalNote({ text: '', attachments: [] })}
                                                                        className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700"
                                                                    >
                                                                        Borrar nota interna
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1 mb-1 text-indigo-700">
                                                                    <MessageCircle size={12} /> {noteType === 'SESSION' ? 'Sesión' : 'Feedback'}
                                                                </label>
                                                                <textarea 
                                                                    className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                                    rows={3}
                                                                    value={feedback.text}
                                                                    onChange={(e) => setFeedback(prev => ({...prev, text: e.target.value}))}
                                                                />
                                                                {(feedback.text || feedback.attachments.length > 0) && (
                                                                    <button
                                                                        onClick={() => setFeedback({ text: '', attachments: [] })}
                                                                        className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700"
                                                                    >
                                                                        Borrar contenido
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="flex justify-end gap-2 pt-2">
                                                            <button onClick={() => setEditingEntryId(null)} className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded">Cancelar</button>
                                                            <button onClick={() => handleSaveNotes(entry)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded flex items-center gap-1">
                                                                <Save size={12} /> Guardar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3 pt-1">
                                                        {(pNote.text || pNote.attachments.length > 0) && (
                                                            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 relative">
                                                                <h5 className="text-[10px] font-bold text-amber-800 uppercase mb-1 flex items-center gap-1">
                                                                    <FileText size={11} /> Nota Interna
                                                                </h5>
                                                                {pNote.text && (
                                                                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{pNote.text}</p>
                                                                )}
                                                                {pNote.attachments.length > 0 && (
                                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                                        {pNote.attachments.map(att => (
                                                                            <AttachmentThumb key={att.id} att={att} />
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {showSessionFeedback && (
                                                            <div className="rounded-xl p-3 border relative bg-indigo-50 border-indigo-100">
                                                                <h5 className="text-[10px] font-bold text-indigo-800 uppercase mb-1 flex items-center gap-1">
                                                                    <MessageCircle size={11} /> Feedback Paciente
                                                                </h5>
                                                                {feedbackDisplayText && (
                                                                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{feedbackDisplayText}</p>
                                                                )}
                                                                {pFeed.attachments.length > 0 && (
                                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                                        {pFeed.attachments.map(att => (
                                                                            <AttachmentThumb key={att.id} att={att} />
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Resumen Global */}
                    <div className="hidden md:block w-96 bg-white border-l border-slate-200 p-8 overflow-y-auto shrink-0">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                             <Activity className="text-indigo-500" /> Resumen Global
                        </h3>
                        <InsightsPanel entries={filteredEntries} mode="CLINICAL" hideChart={true} />
                        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Última entrada del diario</h4>
                            {latestDiaryEntry ? (
                                <div className="space-y-2">
                                    <div className="text-xs text-slate-500">{new Date(latestDiaryEntry.timestamp).toLocaleString()}</div>
                                    <p className="text-sm text-slate-700 leading-relaxed line-clamp-4">{latestDiaryEntry.summary}</p>
                                    {latestDiaryEntry.emotions?.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {latestDiaryEntry.emotions.slice(0, 6).map(em => (
                                                <span key={em} className="text-[10px] px-2 py-0.5 bg-white text-slate-600 rounded border border-slate-200 font-semibold">
                                                    {em}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-sm text-slate-400 italic">Sin entradas recientes.</div>
                            )}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'PLAN' ? (
                <div className="p-8 max-w-4xl mx-auto">
                    <GoalsPanel 
                        title="Plan Terapéutico & Tareas"
                        goals={goals}
                        onAddGoal={handleAddGoal}
                        onToggleGoal={handleToggleGoal}
                        onDeleteGoal={handleDeleteGoal}
                        showAdd={true}
                    />
                </div>
            ) : activeTab === 'INFO' ? (
                <div className="h-full overflow-y-auto p-4 md:p-8 pb-20 md:pb-8 max-w-4xl mx-auto">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-2xl font-bold">
                                    {patient.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold">{patientUser?.firstName || patientUser?.name || patient.name} {patientUser?.lastName || ''}</h3>
                                    <p className="text-indigo-100 text-sm mt-1">Información del Paciente</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Personal Information Section */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                                    <User size={16} /> Datos Personales
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                        <div className="text-xs text-slate-500 font-semibold mb-1">Nombre Completo</div>
                                        <div className="text-slate-900 font-medium">
                                            {patientUser?.firstName || patientUser?.name || patient.name} {patientUser?.lastName || ''}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                        <div className="text-xs text-slate-500 font-semibold mb-1">DNI / Documento</div>
                                        <div className="text-slate-900 font-medium">
                                            {patientUser?.dni || '—'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                        <div className="text-xs text-slate-500 font-semibold mb-1">Fecha de Nacimiento</div>
                                        <div className="text-slate-900 font-medium">
                                            {patientUser?.dateOfBirth ? new Date(patientUser.dateOfBirth).toLocaleDateString('es-ES') : '—'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                        <div className="text-xs text-slate-500 font-semibold mb-1">Email</div>
                                        <div className="text-slate-900 font-medium truncate">
                                            {patientUser?.email || patient.email}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                        <div className="text-xs text-slate-500 font-semibold mb-1">Teléfono</div>
                                        <div className="text-slate-900 font-medium">
                                            {patientUser?.phone || '—'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Address Section */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                                    <Mail size={16} /> Dirección
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 md:col-span-2">
                                        <div className="text-xs text-slate-500 font-semibold mb-1">Dirección Completa</div>
                                        <div className="text-slate-900 font-medium">
                                            {patientUser?.address || '—'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                        <div className="text-xs text-slate-500 font-semibold mb-1">Ciudad</div>
                                        <div className="text-slate-900 font-medium">
                                            {patientUser?.city || '—'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                        <div className="text-xs text-slate-500 font-semibold mb-1">Código Postal</div>
                                        <div className="text-slate-900 font-medium">
                                            {patientUser?.postalCode || '—'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                                        <div className="text-xs text-slate-500 font-semibold mb-1">País</div>
                                        <div className="text-slate-900 font-medium">
                                            {patientUser?.country || '—'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Additional Info Section */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                                    <FileText size={16} /> Información Adicional
                                </h4>
                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                                        <div>
                                            <div className="text-2xl font-bold text-indigo-600">{entries.length}</div>
                                            <div className="text-xs text-slate-600 mt-1">Entradas</div>
                                        </div>
                                        <div>
                                            <div className="text-2xl font-bold text-purple-600">{goals.length}</div>
                                            <div className="text-xs text-slate-600 mt-1">Objetivos</div>
                                        </div>
                                        <div className="col-span-2 md:col-span-1">
                                            <div className="text-2xl font-bold text-pink-600">
                                                {avgSentiment.toFixed(1)}/10
                                            </div>
                                            <div className="text-xs text-slate-600 mt-1">Ánimo Promedio</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {!patientUser?.firstName && !patientUser?.dni && !patientUser?.address && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                                    <AlertTriangle size={20} className="text-yellow-600 shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-sm font-semibold text-yellow-900 mb-1">Información Incompleta</div>
                                        <div className="text-xs text-yellow-700">
                                            El paciente aún no ha completado su información personal. Puedes solicitarle que la actualice desde su perfil.
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'BILLING' ? (
                <div className="h-full overflow-y-auto p-4 md:p-8 pb-20 md:pb-8">
                    {(() => {
                        console.log('[PatientDetailModal] BILLING tab - currentPsychologistId:', currentPsychologistId);
                        console.log('[PatientDetailModal] BILLING tab - patient.id:', patient.id);
                        return currentPsychologistId ? (
                            <BillingPanel psychologistId={currentPsychologistId} patientId={patient.id} />
                        ) : (
                            <div className="flex items-center justify-center h-64">
                                <div className="text-center">
                                    <div className="text-gray-400 mb-2">
                                        <FileText size={48} className="mx-auto" />
                                    </div>
                                    <div className="text-sm text-gray-500">Cargando información de facturación...</div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            ) : (
                // ANALYTICS TAB CONTENT
                <div className="h-full bg-slate-50 p-4 md:p-8 overflow-y-auto">
                    <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
                        
                        {/* Control Bar for Analytics */}
                        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-800 px-3 flex items-center gap-2">
                                <Filter size={16} className="text-slate-400" /> Filtros
                            </h3>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button 
                                    onClick={() => setAnalyticsRange('WEEK')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${analyticsRange === 'WEEK' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Semana
                                </button>
                                <button 
                                    onClick={() => setAnalyticsRange('MONTH')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${analyticsRange === 'MONTH' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Mes
                                </button>
                                <button 
                                    onClick={() => setAnalyticsRange('YEAR')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${analyticsRange === 'YEAR' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Año
                                </button>
                            </div>
                        </div>

                        {/* Stats Cards - Grid cols 1 on mobile, 3 on Desktop */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between md:block">
                                <div>
                                    <h4 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wide mb-1 md:mb-2">Total Entradas</h4>
                                    <p className="text-3xl md:text-4xl font-bold text-slate-800">{filteredEntries.length}</p>
                                </div>
                                <div className="md:hidden bg-indigo-50 p-2 rounded-full text-indigo-500"><FileText size={20} /></div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between md:block">
                                <div>
                                    <h4 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wide mb-1 md:mb-2">Promedio Ánimo</h4>
                                    <p className={`text-3xl md:text-4xl font-bold ${avgSentiment >= 7 ? 'text-green-500' : avgSentiment >= 4 ? 'text-yellow-500' : 'text-red-500'}`}>
                                        {avgSentiment.toFixed(1)}<span className="text-sm md:text-lg text-slate-300">/10</span>
                                    </p>
                                </div>
                                <div className="md:hidden bg-indigo-50 p-2 rounded-full text-indigo-500"><Activity size={20} /></div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between md:block">
                                <div>
                                    <h4 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wide mb-1 md:mb-2">Nivel de Riesgo</h4>
                                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold border ${patient.riskLevel === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200' : patient.riskLevel === 'MEDIUM' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                        {patient.riskLevel === 'HIGH' && <AlertTriangle size={16} />}
                                        {patient.riskLevel === 'HIGH' ? 'ALTO' : patient.riskLevel === 'MEDIUM' ? 'MEDIO' : 'BAJO'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Charts Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 pb-10">
                            
                            {/* Mood Evolution Chart */}
                            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between gap-3 mb-4 md:mb-6">
                                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                        <TrendingUp className="text-indigo-500" /> Evolución Anímica
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{analyticsRange === 'WEEK' ? '7 días' : analyticsRange === 'MONTH' ? '30 días' : '12 meses'}</span>
                                        <span className="text-xs text-slate-400">0–10</span>
                                    </div>
                                </div>
                                <div className="h-52 md:h-64 w-full rounded-xl bg-gradient-to-b from-slate-50 via-white to-white border border-slate-100 p-2 shadow-inner">
                                    {chartData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="moodGradient" x1="0" y1="0" x2="1" y2="0">
                                                        <stop offset="0%" stopColor="#6366f1" />
                                                        <stop offset="100%" stopColor="#8b5cf6" />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#e5e7eb" />
                                                <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} dy={10} />
                                                <YAxis domain={[0, 10]} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={28} />
                                                <RechartsTooltip 
                                                    contentStyle={{borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)'}}
                                                    itemStyle={{color: '#4f46e5', fontSize: '12px', fontWeight: 600}}
                                                    labelStyle={{fontSize: '11px', color: '#64748b'}}
                                                    cursor={{stroke: '#cbd5e1', strokeWidth: 1}}
                                                    isAnimationActive={false}
                                                    formatter={(value: number) => [value, 'Puntuación']}
                                                />
                                                <Line 
                                                    type="monotone" 
                                                    dataKey="score" 
                                                    stroke="url(#moodGradient)" 
                                                    strokeWidth={3} 
                                                    dot={{fill: '#6366f1', strokeWidth: 2, r: 4, stroke: '#fff'}} 
                                                    activeDot={{r: 7, stroke: '#6366f1', strokeWidth: 2}}
                                                    isAnimationActive={true}
                                                >
                                                    <LabelList dataKey="score" position="top" offset={10} style={{ fontSize: '10px', fill: '#6366f1', fontWeight: 'bold' }} />
                                                </Line>
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                                            Sin datos en este periodo
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Frequent Emotions Chart */}
                            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 shrink-0">
                                    <PieChart className="text-rose-500" /> Frecuencia de Emociones
                                </h3>
                                <div className="flex-1 w-full overflow-y-auto min-h-[200px]" style={{ maxHeight: '400px' }}>
                                    {emotionData.length > 0 ? (
                                        <div style={{ height: `${barChartHeight}px`, minHeight: '100%' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart 
                                                    data={emotionData} 
                                                    layout="vertical" 
                                                    margin={{top: 5, right: 30, left: 10, bottom: 5}}
                                                    barSize={24}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                                                    <XAxis type="number" hide />
                                                    <YAxis 
                                                        dataKey="name" 
                                                        type="category" 
                                                        tick={{fontSize: 11, fill: '#475569', fontWeight: 600}} 
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        width={110} 
                                                        interval={0}
                                                    />
                                                    <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px'}} />
                                                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                                        {emotionData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                                        ))}
                                                        <LabelList dataKey="count" position="right" style={{ fontSize: '12px', fill: '#64748b' }} />
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div className="h-48 flex items-center justify-center text-slate-400 text-sm italic">
                                            Sin emociones registradas
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        {showSessionRecorder && (
            <SessionRecorder
                onComplete={(transcript, audioAttachment) => {
                    if (transcript) {
                        setSessionTranscript(prev => (prev ? `${prev}\n${transcript}` : transcript));
                    }
                    if (audioAttachment) {
                        setSessionNote(prev => ({ ...prev, attachments: [...prev.attachments, audioAttachment] }));
                    }
                    setShowSessionRecorder(false);
                }}
                onCancel={() => setShowSessionRecorder(false)}
            />
        )}
    </div>
  );
};

// Mini Component for Displaying Attachment Thumbnails
const AttachmentThumb: React.FC<{ att: Attachment }> = ({ att }) => (
    att.type === 'AUDIO' ? (
        <div className="block group shrink-0 relative" title={att.name}>
            <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex flex-col items-center justify-center hover:border-indigo-400 transition-colors p-1">
                <audio controls src={att.url} className="w-full" />
            </div>
            <a href={att.url} download={att.name} className="block text-[9px] text-indigo-600 mt-1 text-center">Descargar</a>
        </div>
    ) : att.type === 'VIDEO' ? (
        <div className="block group shrink-0 relative" title={att.name}>
            <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex flex-col items-center justify-center hover:border-indigo-400 transition-colors p-1">
                <video controls src={att.url} className="w-full" />
            </div>
            <a href={att.url} download={att.name} className="block text-[9px] text-indigo-600 mt-1 text-center">Descargar</a>
        </div>
    ) : (
        <a href={att.url} download={att.name} className="block group shrink-0 relative" title={att.name}>
            {att.type === 'IMAGE' ? (
                <img src={att.url} alt="adjunto" className="w-16 h-16 rounded-lg object-cover border border-slate-200 hover:border-indigo-400 transition-colors" />
            ) : (
                <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex flex-col items-center justify-center hover:border-indigo-400 transition-colors">
                    <FileText size={20} className="text-slate-400" />
                    <span className="text-[8px] text-slate-500 mt-1 max-w-full truncate px-1">{att.name}</span>
                </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity text-white">
                <Download size={16} />
            </div>
        </a>
    )
);

export default PatientDetailModal;