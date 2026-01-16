export type UserRole = 'PATIENT' | 'PSYCHOLOGIST';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // In a real app, this would be hashed
  role: UserRole;
  isPsychologist?: boolean;
  avatarUrl?: string; // Profile picture (Base64)
  accessList: string[]; // For Patients: List of Psychologist IDs who can view data. For Psychs: List of Patient IDs.
  // Optional OAuth fields
  googleId?: string;

  // Premium subscription fields
  isPremium?: boolean;
  premiumUntil?: number; // timestamp in ms
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export interface Invitation {
  id: string;
  fromPsychologistId: string;
  fromPsychologistName: string;
  toUserEmail: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  timestamp: number;
}

export interface Attachment {
  id: string;
  type: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';
  url: string; // Base64 string for local demo
  name: string;
}

export interface ClinicalNoteContent {
  text: string;
  attachments: Attachment[];
}

export interface EmotionStructure {
  level1: string; // Primary (e.g., Joy, Sadness, Anger, Fear, Love, Surprise)
  level2: string; // Secondary (e.g., Optimism, Lonely)
  level3: string; // Tertiary (e.g., Inspired, Isolated)
}

export interface JournalEntry {
  id: string;
  userId: string; // Added owner ID
  date: string; // ISO string YYYY-MM-DD
  timestamp: number;
  transcript: string;
  summary: string;
  sentimentScore: number;
  emotions: string[]; // Legacy tags (populated with Level 2 for display)
  advice: string;
  
  // New structured emotions based on the Feelings Wheel
  structuredEmotions?: EmotionStructure[];

  // Updated fields to support complex content (Text + Attachments)
  // Union type string | ClinicalNoteContent allows backward compatibility
  psychologistNote?: string | ClinicalNoteContent; 
  psychologistFeedback?: string | ClinicalNoteContent;
  psychologistFeedbackUpdatedAt?: number;
  psychologistFeedbackReadAt?: number;

  // Type of psychologist-created entry (for visibility/labeling)
  psychologistEntryType?: 'NOTE' | 'FEEDBACK' | 'SESSION';
  
  // New field to identify if entry was created manually by psychologist
  createdBy?: 'USER' | 'PSYCHOLOGIST';
}

export interface Goal {
  id: string;
  userId: string; // Added owner ID
  description: string;
  createdAt: number;
  completed: boolean;
  aiFeedback: string;
  createdBy?: 'USER' | 'PSYCHOLOGIST'; // To distinguish personal goals from assigned tasks
}

export interface UserSettings {
  notificationsEnabled: boolean;
  feedbackNotificationsEnabled?: boolean;
  notificationTime: string;
  language: string; // 'es-ES' | 'en-US'
  voice: string;    // 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Aoede'
}

export interface WeeklyReport {
  themes: string[];
  moodSummary: string;
  milestones: string[];
  recommendations: string[];
}

// Derived view for dashboard
export interface PatientSummary {
  id: string;
  name: string;
  email: string;
  lastUpdate: string;
  averageSentiment: number;
  recentSummary: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  isSelf?: boolean; // To mark if this is the psychologist themselves
}

export enum ViewState {
  AUTH = 'AUTH',
  CALENDAR = 'CALENDAR',
  VOICE_SESSION = 'VOICE_SESSION',
  INSIGHTS = 'INSIGHTS',
  PATIENTS = 'PATIENTS',
  SUPERADMIN = 'SUPERADMIN'
}

export interface SentimentDataPoint {
  date: string;
  score: number;
}