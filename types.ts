export type UserRole = 'PATIENT' | 'PSYCHOLOGIST';

export interface User {
  id: string;
  name: string;
  email: string;
  user_email?: string; // Email en columna de tabla Supabase
  password?: string; // In a real app, this would be hashed
  role?: UserRole; // DEPRECATED: usar is_psychologist en su lugar
  isPsychologist?: boolean;
  is_psychologist?: boolean; // Columna de tabla Supabase (boolean NOT NULL DEFAULT false) - USAR ESTE
  avatarUrl?: string; // Profile picture (Base64)
  
  // OAuth field según el nuevo schema
  auth_user_id?: string; // UUID que referencia auth.users(id) - columna de tabla Supabase
  
  // Psychologist profile reference según el nuevo schema
  psycologist_profile_id?: string; // FK a psychologist_profiles(id) - columna de tabla Supabase

  // Premium subscription fields
  isPremium?: boolean;
  premiumUntil?: number; // timestamp in ms
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;

  // Personal information fields
  firstName?: string;
  lastName?: string;
  dni?: string; // Documento Nacional de Identidad
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  dateOfBirth?: string; // ISO format YYYY-MM-DD
}

export interface CareRelationship {
  id: string;
  // Columnas de tabla según el nuevo schema (minúsculas)
  psychologist_user_id: string; // FK a users(id) - ID del usuario con rol de psicólogo
  patient_user_id: string; // FK a users(id) - ID del usuario con rol de paciente
  created_at?: string; // timestamp with time zone (ISO string)
  
  // Campos adicionales en data JSONB
  createdAt?: number; // timestamp en ms (puede estar en data)
  endedAt?: number; // Timestamp cuando se finalizó la relación (puede estar en data)
}

export interface Invitation {
  id: string;
  // Columnas de tabla según el nuevo schema
  psychologist_user_id: string; // FK a users(id) - ID del usuario que actúa como psicólogo
  patient_user_id?: string; // FK a users(id) - Se rellena al aceptar si el usuario ya existe
  
  // Campos adicionales en data JSONB
  psych_user_email?: string;
  psych_user_name?: string;
  patient_user_email?: string;
  patient_user_name?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  timestamp: number;
  createdAt?: string; // ISO string
  initiatorEmail?: string; // Email de quien inició la invitación
  // Información adicional del paciente proporcionada por el psicólogo
  patient_first_name?: string;
  patient_last_name?: string;
  emailSent?: boolean; // Indica si se envió el email de bienvenida
  emailSentAt?: number; // Timestamp del envío
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
  // Columnas de tabla según el nuevo schema
  creator_user_id: string; // FK a users(id) - Usuario que creó la entrada
  target_user_id: string; // FK a users(id) - Usuario objetivo de la entrada
  
  // Campos en data JSONB
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
  
  // ID del psicólogo que creó esta entrada (para filtrar en relaciones finalizadas)
  createdByPsychologistId?: string;
}

export interface Goal {
  id: string;
  // Columna de tabla según el nuevo schema
  patient_user_id: string; // FK a users(id) - Usuario paciente dueño del objetivo
  
  // Campos en data JSONB
  description: string;
  createdAt: number;
  completed: boolean;
  aiFeedback?: string; // Made optional since AI feedback is removed
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
  avatarUrl?: string;
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