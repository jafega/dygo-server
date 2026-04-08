import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { ViewState, JournalEntry, Goal, UserSettings, WeeklyReport, User } from './types';
import * as StorageService from './services/storageService';
import * as AuthService from './services/authService';
import { USE_BACKEND, API_URL } from './services/config';
import { detectDefaultPrefix } from './services/phoneUtils';
import { isTempEmail } from './services/textUtils';
import { analyzeJournalEntry, analyzeGoalsProgress, generateWeeklyReport } from './services/genaiService';
import AuthScreen from './components/AuthScreen';
import SettingsModal from './components/SettingsModal';
import PsychologistSidebar from './components/PsychologistSidebar';
import UpgradeModal from './components/UpgradeModal';
import type { PatientDashboardHandle } from './components/PatientDashboard';
import type { CentrosPanelRef } from './components/CentrosPanel';
// Lazy-loaded: patient panels (not needed by psychologists on initial load)
const VoiceSession = lazy(() => import('./components/VoiceSession'));
const PatientSessions = lazy(() => import('./components/PatientSessions'));
const PatientBillingPanel = lazy(() => import('./components/PatientBillingPanel'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const InsightsPanel = lazy(() => import('./components/InsightsPanel'));
const GoalsPanel = lazy(() => import('./components/GoalsPanel'));
const PatientProfilePanel = lazy(() => import('./components/PatientProfilePanel'));
const PatientDocumentsPanel = lazy(() => import('./components/PatientDocumentsPanel'));
const EntryModal = lazy(() => import('./components/EntryModal'));
const WeeklyReportModal = lazy(() => import('./components/WeeklyReportModal'));
const PatientDashboard = lazy(() => import('./components/PatientDashboard'));
// Lazy-loaded: psychologist panels (not needed by patients on initial load)
const BillingPanel = lazy(() => import('./components/BillingPanel'));
const PsychologistProfilePanel = lazy(() => import('./components/PsychologistProfilePanel'));
const PsychologistSchedule = lazy(() => import('./components/PsychologistSchedule'));
const PsychologistDashboard = lazy(() => import('./components/PsychologistDashboard'));
const SessionsList = lazy(() => import('./components/SessionsList'));
const CentrosPanel = lazy(() => import('./components/CentrosPanel'));
const ConnectionsPanel = lazy(() => import('./components/ConnectionsPanel'));
const TemplatesPanel = lazy(() => import('./components/TemplatesPanel'));
const PsychologistMaterialsPanel = lazy(() => import('./components/PsychologistMaterialsPanel'));
const BulkImportPanel = lazy(() => import('./components/BulkImportPanel'));
const PsychologistAIChat = lazy(() => import('./components/PsychologistAIChat'));
// Lazy-loaded: admin only
const SuperAdmin = lazy(() => import('./components/SuperAdmin'));
import { Mic, LayoutDashboard, Calendar, Target, BookOpen, User as UserIcon, Users, Stethoscope, ArrowLeftRight, CheckSquare, Loader2, MessageCircle, Menu, X, CalendarIcon, Heart, TrendingUp, FileText, Briefcase, Link2, Plus, Clock, AlertCircle, Smile, Shield, Building2, LogOut, Upload, Bot, FolderOpen, Phone } from 'lucide-react';

// Custom Mainds Logo Component
const MaindsLogo: React.FC<{ className?: string }> = ({ className = "w-12 h-12" }) => (
  <svg viewBox="0 0 1242 641" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M0 0 C0 0.66 0 1.32 0 2 C0.54011719 2.2165625 1.08023437 2.433125 1.63671875 2.65625 C19.94576132 13.06668081 29.67433186 36.3929178 35.33886719 55.58984375 C52.2048656 117.07475377 34.92730932 182.55168351 4.24462891 236.83642578 C-2.92254249 249.29532592 -10.68614268 261.27877909 -19 273 C-19.52916016 273.74846191 -20.05832031 274.49692383 -20.60351562 275.26806641 C-27.10229733 284.43776339 -33.69184911 293.45153066 -41 302 C-41.68666748 302.81186768 -41.68666748 302.81186768 -42.38720703 303.64013672 C-56.81892661 320.68893408 -72.04526919 338.62408926 -89.609375 352.53515625 C-91.39875181 354.42003351 -91.93303875 355.38372817 -92 358 C-90.4444811 360.57875916 -90.4444811 360.57875916 -88.125 363.125 C-87.29484375 364.09179688 -86.4646875 365.05859375 -85.609375 366.0546875 C-84.74828125 367.02664063 -83.8871875 367.99859375 -83 369 C-82.22140625 369.88945312 -81.4428125 370.77890625 -80.640625 371.6953125 C-55.95038449 399.53568714 -23.99006402 418.90222631 11 431 C11.76957031 431.27150879 12.53914063 431.54301758 13.33203125 431.82275391 C31.9094036 438.31601078 51.25899148 442.29829577 70.6875 445.25 C71.66912109 445.40098145 72.65074219 445.55196289 73.66210938 445.70751953 C94.54806453 448.68595076 115.43040457 449.37236318 136.5 449.3125 C138.40306412 449.31076279 138.40306412 449.31076279 140.34457397 449.30899048 C159.75684286 449.27401507 178.74765492 448.55845117 198 446 C199.88647345 445.77914457 201.77318173 445.56028258 203.66015625 445.34375 C252.40085965 439.43347412 302.90414806 421.17515523 339 387 C340.36965259 385.80633629 341.74445266 384.61854628 343.125 383.4375 C351.74140092 375.89167394 359.62966682 367.55549977 366 358 C365.68896679 354.61803226 364.40306242 353.07870745 361.9296875 350.85546875 C361.28765381 350.26838135 360.64562012 349.68129395 359.98413086 349.07641602 C359.28811768 348.45307373 358.59210449 347.82973145 357.875 347.1875 C356.4134605 345.84842943 354.95387442 344.50722414 353.49609375 343.1640625 C352.74956543 342.47731445 352.00303711 341.79056641 351.23388672 341.08300781 C343.3498677 333.73148319 335.55479824 326.11460812 328.59375 317.875 C326.65674129 315.59616622 324.64094375 313.39675343 322.625 311.1875 C309.14150279 296.20331002 297.36700562 279.96792055 286.37109375 263.1015625 C285.10889687 261.16691315 283.83703832 259.23902986 282.5625 257.3125 C276.95069353 248.77602825 271.83556106 239.99792754 267 231 C266.66645508 230.37963867 266.33291016 229.75927734 265.98925781 229.12011719 C245.42086148 190.41878638 232.82062904 147.92013998 232.6875 104 C232.68373352 103.31929443 232.67996704 102.63858887 232.67608643 101.93725586 C232.63168943 86.15865771 234.62038607 71.16428067 239 56 C239.20608887 55.27522461 239.41217773 54.55044922 239.62451172 53.80371094 C244.34378079 37.54570544 251.52105459 23.5721783 263 11 C263.75796875 10.14921875 264.5159375 9.2984375 265.296875 8.421875 C281.73838802 -9.09424671 305.68195159 -18.21308868 329.453125 -19.23828125 C359.67687574 -19.93684165 385.04894768 -9.86936871 407 11 C413.8340257 17.73430536 419.78387995 24.93776171 425 33 C425.42361816 33.63196289 425.84723633 34.26392578 426.28369141 34.91503906 C449.67268321 69.81799425 462.36670334 109.75596528 469 151 C469.19754883 152.20930176 469.39509766 153.41860352 469.59863281 154.66455078 C472.50420938 173.20840647 473.3712617 191.54817839 473.375 210.3125 C473.37690338 211.33691193 473.37880676 212.36132385 473.38076782 213.41677856 C473.37208014 254.63402185 466.99293603 297.35798074 449.53125 335.02734375 C448.76976558 337.85491458 448.91957295 339.25479042 450 342 C452.16528851 343.86122672 454.17775918 345.3458665 456.5625 346.875 C457.26576416 347.33986816 457.96902832 347.80473633 458.69360352 348.28369141 C461.11776937 349.87387784 463.55830858 351.43687405 466 353 C466.89299805 353.58136719 467.78599609 354.16273438 468.70605469 354.76171875 C482.81026865 363.93312443 497.24903164 372.09496343 512.28515625 379.63525391 C514.61582838 380.80687776 516.93541984 381.99624617 519.25 383.19921875 C580.02903079 414.6019778 647.70890054 430.57286937 715.76855469 434.26806641 C716.55249603 434.3107515 717.33643738 434.35343658 718.14413452 434.39741516 C719.66279469 434.47746204 721.18170221 434.55297355 722.70083618 434.62345886 C727.89145066 434.89145066 727.89145066 434.89145066 729 436 C729.09905152 437.83572631 729.12799207 439.67527575 729.12939453 441.51367188 C729.13412277 443.28055359 729.13412277 443.28055359 729.13894653 445.08312988 C729.1369223 446.36538452 729.13489807 447.64763916 729.1328125 448.96875 C729.13376923 450.27453003 729.13472595 451.58031006 729.13571167 452.92565918 C729.13718833 455.69312722 729.13503511 458.46056304 729.13037109 461.22802734 C729.12467381 464.78262649 729.12795298 468.33715014 729.13394356 471.89174652 C729.13841747 475.27158714 729.13528886 478.65140723 729.1328125 482.03125 C729.13584885 483.95463196 729.13584885 483.95463196 729.13894653 485.91687012 C729.13579437 487.09479126 729.13264221 488.2727124 729.12939453 489.48632812 C729.12820114 491.05066589 729.12820114 491.05066589 729.12698364 492.64660645 C729 495 729 495 728 496 C657.45360643 499.85742636 576.62507684 480.09903529 513 450 C511.5159668 449.30438965 511.5159668 449.30438965 510.00195312 448.59472656 C502.63359636 445.13257023 495.31048646 441.58244311 488 438 C486.93442871 437.48083008 485.86885742 436.96166016 484.77099609 436.42675781 C462.76347216 425.68764539 462.76347216 425.68764539 452.88720703 419.22412109 C450.49972766 417.67550252 448.09175616 416.16078166 445.68359375 414.64453125 C443.72630584 413.40926075 441.76927636 412.17358068 439.8125 410.9375 C438.89710449 410.3595166 437.98170898 409.7815332 437.03857422 409.18603516 C431.59031049 405.72128148 426.29685437 402.12120864 421.1003418 398.28735352 C418.98428301 396.738712 418.98428301 396.738712 416 397 C413.93751238 398.84362576 413.93751238 398.84362576 411.875 401.3125 C410.66650391 402.69501953 410.66650391 402.69501953 409.43359375 404.10546875 C407.21664298 406.74232352 405.07380602 409.4228394 402.9375 412.125 C393.62236342 423.60986192 382.75019565 434.0436688 371 443 C369.81238918 443.92824365 368.62489715 444.85663929 367.4375 445.78515625 C292.78224389 503.55691161 197.74305486 515.26194834 66.125 508.1875 C2.62350227 499.7550088 -57.42525774 477.48801751 -106 435 C-106.5053125 434.55930176 -107.010625 434.11860352 -107.53125 433.66455078 C-120.4517507 422.32125964 -131.62297814 409.68352782 -142 396 C-145.2847593 397.55457116 -148.28254625 399.40512015 -151.33203125 401.37890625 C-152.36996826 402.04825195 -153.40790527 402.71759766 -154.47729492 403.40722656 C-155.5779126 404.1184668 -156.67853027 404.82970703 -157.8125 405.5625 C-180.02954708 419.8472349 -202.68565865 432.80655806 -226.67529297 443.91992188 C-228.75934418 444.88818931 -230.83625871 445.86959702 -232.91015625 446.859375 C-235.94019778 448.29691375 -238.97769893 449.71090254 -242.02978516 451.10058594 C-243.38866855 451.72092378 -244.74497496 452.34692716 -246.09912109 452.97753906 C-283.08220745 470.10159265 -323.21104935 479.97092083 -363 488 C-364.09602539 488.22316895 -365.19205078 488.44633789 -366.32128906 488.67626953 C-394.85981485 494.35039995 -424.92575586 497.02414167 -454 496 C-455.31538313 493.36923375 -455.12710325 491.41053669 -455.12939453 488.46459961 C-455.13254669 487.30677475 -455.13569885 486.14894989 -455.13894653 484.95603943 C-455.1369223 483.70081985 -455.13489807 482.44560028 -455.1328125 481.15234375 C-455.13376923 479.87017471 -455.13472595 478.58800568 -455.13571167 477.26698303 C-455.13718671 474.55256955 -455.13503994 471.83818896 -455.13037109 469.1237793 C-455.12466822 465.63758959 -455.12795754 462.15147677 -455.13394356 458.66528988 C-455.13841655 455.34846826 -455.13528929 452.03166756 -455.1328125 448.71484375 C-455.13483673 447.45759995 -455.13686096 446.20035614 -455.13894653 444.90501404 C-455.13579437 443.75034134 -455.13264221 442.59566864 -455.12939453 441.40600586 C-455.12859894 440.38389511 -455.12780334 439.36178436 -455.12698364 438.30870056 C-455 436 -455 436 -454 435 C-451.89345458 434.80522126 -449.78090387 434.67508614 -447.66796875 434.5703125 C-446.3128085 434.49861195 -444.957666 434.42657539 -443.60253906 434.35424805 C-442.52413757 434.29882339 -442.52413757 434.29882339 -441.4239502 434.24227905 C-380.95376822 431.0712334 -320.06171359 418.96940522 -265 393 C-263.51886719 392.32710938 -263.51886719 392.32710938 -262.0078125 391.640625 C-230.994636 377.53683324 -201.62716454 360.96963524 -174 341 C-175.69314427 335.78961846 -177.48942156 330.63936463 -179.44775391 325.52294922 C-189.70516884 298.56175976 -195.24952947 270.67193182 -198 242 C-198.09643799 241.00959717 -198.19287598 240.01919434 -198.29223633 238.9987793 C-199.10134055 229.76865092 -199.20243455 220.57085371 -199.1875 211.3125 C-199.18559662 210.0920549 -199.18559662 210.0920549 -199.18365479 208.84695435 C-198.97851116 139.42957417 -182.3933967 63.54093569 -133 12 C-97.70141595 -22.94441766 -40.92801869 -30.28673383 0 0 Z M-95 61 C-104.45087581 72.81958391 -110.89869564 86.24297585 -117 100 C-117.50144531 101.08667969 -118.00289063 102.17335937 -118.51953125 103.29296875 C-132.78032213 135.39106631 -137.24241113 173.08676493 -137.1875 207.875 C-137.18689575 208.59032898 -137.1862915 209.30565796 -137.18566895 210.04266357 C-137.12132159 238.34059135 -135.67764145 271.75209031 -124 298 C-117.55201904 295.27200805 -113.20953625 290.23541239 -108.77734375 285.02734375 C-107.13119489 283.14964868 -105.42264884 281.41872302 -103.625 279.6875 C-99.83493676 275.96526787 -96.5671222 271.87485826 -93.2421875 267.73828125 C-91.28928101 265.3532857 -89.27558218 263.07819913 -87.1875 260.8125 C-54.16715829 223.93433618 -28.78691148 174.97428604 -21 126 C-20.74065674 124.59572754 -20.74065674 124.59572754 -20.47607422 123.16308594 C-17.97631397 106.55442248 -18.96356092 88.00118665 -24 72 C-24.28875 71.03707031 -24.5775 70.07414062 -24.875 69.08203125 C-28.26010508 59.33474206 -34.31119479 50.95867597 -43.48828125 46.08203125 C-62.66794476 37.81956345 -81.9435101 46.0942544 -95 61 Z M311 51 C308.15310372 53.68291796 308.15310372 53.68291796 306 57 C305.52046875 57.63808594 305.0409375 58.27617188 304.546875 58.93359375 C297.50614557 69.19243435 294.29158066 83.64426938 294 96 C293.938125 97.20398438 293.87625 98.40796875 293.8125 99.6484375 C292.26633718 142.01628159 309.82859181 186.97134778 333 222 C333.639375 222.99773437 334.27875 223.99546875 334.9375 225.0234375 C348.47462535 245.82039218 364.32838729 264.89134938 381.234375 283.01171875 C384.33027979 286.33651609 387.31838246 289.75162874 390.28125 293.1953125 C392.06641741 295.06973828 393.83990161 296.57468918 396 298 C396.66 298 397.32 298 398 298 C405.11318621 276.34267017 409.4233493 254.44774914 410.828125 231.68798828 C410.99095204 229.14150287 411.19430814 226.60138657 411.40625 224.05859375 C415.61166809 168.04956394 402.90831545 101.38751037 365.9375 57.5546875 C359.67503713 50.91344664 352.03609667 45.80721933 343 44 C342.02353516 43.80083984 342.02353516 43.80083984 341.02734375 43.59765625 C330.08198853 41.82971321 319.73403559 44.17037818 311 51 Z" fill="currentColor" transform="translate(491,64)" />
  </svg>
);

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewState, setViewState] = useState<ViewState>(ViewState.AUTH);
  const [showRolePrompt, setShowRolePrompt] = useState(false);
  const [pendingRole, setPendingRole] = useState<'PATIENT' | 'PSYCHOLOGIST' | null>(null);
  const [showFirstTimeRoleModal, setShowFirstTimeRoleModal] = useState(false);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [phonePromptPrefix, setPhonePromptPrefix] = useState<string>(() => detectDefaultPrefix());
  const [phonePromptNumber, setPhonePromptNumber] = useState('');
  const [phonePromptSaving, setPhonePromptSaving] = useState(false);
  
  const [psychViewMode, setPsychViewMode] = useState<'DASHBOARD' | 'PERSONAL' | 'ADMIN'>('DASHBOARD');
  const [adminTab, setAdminTab] = useState<'dashboard' | 'users'>('dashboard');
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
  const [psychPanelView, setPsychPanelView] = useState<'patients' | 'billing' | 'profile' | 'dashboard' | 'sessions' | 'schedule' | 'centros' | 'templates' | 'import' | 'ai-assistant' | 'materials'>('schedule');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // State for draggable menu button position (unified across personal/professional)
  const [menuButtonPos, setMenuButtonPos] = useState(() => {
    const saved = localStorage.getItem('maindsMenuButtonPos');
    if (saved) return JSON.parse(saved);
    // Default position: bottom-left (16px from edges)
    const defaultTop = typeof window !== 'undefined' ? window.innerHeight - 64 : 700;
    return { top: defaultTop, left: 16 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Save menu button position to localStorage
  useEffect(() => {
    localStorage.setItem('maindsMenuButtonPos', JSON.stringify(menuButtonPos));
  }, [menuButtonPos]);
  
  // Ref para controlar PatientDashboard
  const patientDashboardRef = useRef<PatientDashboardHandle>(null);
  const centrosPanelRef = useRef<CentrosPanelRef>(null);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [settings, setSettings] = useState<UserSettings>({ 
    notificationsEnabled: false, 
    feedbackNotificationsEnabled: true,
    notificationTime: '20:00',
    language: 'es-ES',
    voice: 'Kore' 
  });
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntryMode, setSelectedEntryMode] = useState<'day' | 'single'>('day');
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<'insights' | 'sessions' | 'appointments' | 'calendar' | 'billing' | 'profile' | 'admin' | 'documents'>('calendar');
  const [showSettings, setShowSettings] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [hasPendingInvites, setHasPendingInvites] = useState(false);
  const [isProfileIncomplete, setIsProfileIncomplete] = useState(false);
  const [error, setError] = useState('');
  const [stripeNotification, setStripeNotification] = useState<'success' | 'cancel' | null>(null);
  const [patientSubscriptionInfo, setPatientSubscriptionInfo] = useState<{
    is_subscribed: boolean;
    is_master: boolean;
    trial_active: boolean;
    trial_days_left: number;
    stripe_status: string | null;
    access_blocked: boolean;
    cancel_at_period_end: boolean;
    current_period_end: number | null;
    plan_price?: number;
  } | null>(null);
  const [showPatientUpgradeModal, setShowPatientUpgradeModal] = useState(false);

  const [psychSubscriptionInfo, setPsychSubscriptionInfo] = useState<{
    is_subscribed: boolean;
    trial_active: boolean;
    trial_days_left: number;
    stripe_status: string | null;
    access_blocked: boolean;
    cancel_at_period_end: boolean;
    current_period_end: number | null;
    blocked_reason?: string | null;
    trial_expiry_date?: number | null;
    is_master?: boolean;
    plan_id?: string;
    plan_name?: string;
    plan_price?: number;
    max_relations?: number | null;
    active_relations?: number;
    relations_remaining?: number | null;
  } | null>(null);

  const [showAppUpgradeModal, setShowAppUpgradeModal] = useState(false);
  const [showPendingSessionsBadge, setShowPendingSessionsBadge] = useState(true);

  // Deep-link: ?sign_document=<signatureId> — patient arriving from email to sign a document
  const [pendingSignDocumentId, setPendingSignDocumentId] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('sign_document');
  });

  // Can the psychologist create new items?
  // Allowed when: master user, or subscription not yet loaded, or active subscription, or trial active
  const psychCanCreate: boolean =
    currentUser?.master === true ||
    psychSubscriptionInfo === null ||
    (!psychSubscriptionInfo.access_blocked &&
      (psychSubscriptionInfo.is_subscribed || psychSubscriptionInfo.trial_active)) ||
    psychSubscriptionInfo.is_master === true;

  // Patient can use AI voice if subscribed, in trial, or is master/superadmin
  const patientCanUseVoice: boolean =
    patientSubscriptionInfo === null ||
    patientSubscriptionInfo.is_master === true ||
    patientSubscriptionInfo.is_subscribed === true ||
    patientSubscriptionInfo.trial_active === true;

  const getFeedbackText = (entry: JournalEntry) => {
    // Nuevo formato: entryType: 'feedback' con content
    if (entry.entryType === 'feedback' && entry.content) {
      return entry.content;
    }
    // Formato antiguo
    if (typeof entry.psychologistFeedback === 'string') return entry.psychologistFeedback;
    if (entry.psychologistFeedback?.text) return entry.psychologistFeedback.text;
    if (entry.psychologistEntryType === 'FEEDBACK') {
      const summaryText = (entry.summary || '').trim();
      if (summaryText) return summaryText;
    }
    return '';
  };

  const isFeedbackUnread = (entry: JournalEntry) => {
    if (!entry.psychologistFeedbackUpdatedAt) return false;
    const readAt = entry.psychologistFeedbackReadAt || 0;
    return readAt < entry.psychologistFeedbackUpdatedAt;
  };

  const hasFeedbackContent = (entry: JournalEntry) => {
    const textHas = getFeedbackText(entry).trim().length > 0;
    // Nuevo formato: entryType: 'feedback' con attachments
    const newFormatAttHas = entry.entryType === 'feedback' && entry.attachments && Array.isArray(entry.attachments) && entry.attachments.length > 0;
    // Formato antiguo
    const attHas = typeof entry.psychologistFeedback === 'object' && 
                   entry.psychologistFeedback?.attachments && 
                   Array.isArray(entry.psychologistFeedback.attachments) && 
                   entry.psychologistFeedback.attachments.length > 0;
    return Boolean(textHas || attHas || newFormatAttHas);
  };

  useEffect(() => {
    console.log('🎬 [App] Componente montado - iniciando...');
    const init = async () => {
        console.log('📋 [App] Estableciendo isLoadingData = true');
        setIsLoadingData(true);
        try {
          console.log('👤 [App] Obteniendo usuario actual...');
          const user = await AuthService.getCurrentUser();
          console.log('👤 [App] Usuario obtenido:', user ? user.email : 'null');
          
          if (user) {
              // BUGFIX: Asegurar que is_psychologist siempre tenga un valor booleano
              if (user.is_psychologist === undefined || user.is_psychologist === null) {
                  user.is_psychologist = false;
                  user.isPsychologist = false;
              }
              
              console.log('✅ [App] Estableciendo usuario:', user.email, 'is_psychologist:', user.is_psychologist);
              setCurrentUser(user);
              
              // If backend is available, try to migrate any local data for this user
              if (USE_BACKEND) {
                  try { await StorageService.migrateLocalToBackend(user.id); } catch (e) { console.warn('Migration skipped', e); }
              }
              
              console.log('📊 [App] Cargando datos del usuario...');
              await refreshUserData(user.id);
              
              // Solo permitir vista de psicólogo si is_psychologist es true
              const canAccessPsychologistView = user.is_psychologist === true;
              const targetView = canAccessPsychologistView ? ViewState.PATIENTS : ViewState.CALENDAR;
              console.log('🎯 [App] Estableciendo vista:', targetView);
              setViewState(targetView);

              // Handle sign_document deep-link: non-psychologist patients go straight to documents tab
              if (pendingSignDocumentId && !canAccessPsychologistView) {
                setActiveTab('documents');
                // Clear the URL param so the link isn't re-processed on refresh
                const url = new URL(window.location.href);
                url.searchParams.delete('sign_document');
                window.history.replaceState({}, '', url.toString());
              }
          } else {
              console.log('🔐 [App] No hay usuario - mostrando AUTH');
              setViewState(ViewState.AUTH);
          }
        } catch (error) {
          console.error('❌ [App] Error inicializando usuario:', error);
          // Don't force logout on initialization errors - might be temporary network issue
          // Only redirect to auth if there's no user data at all
          if (!currentUser) {
            console.log('🔐 [App] Error y no hay usuario - mostrando AUTH');
            setViewState(ViewState.AUTH);
          }
        }
        
        console.log('✅ [App] Estableciendo isLoadingData = false');
        setIsLoadingData(false);
        console.log('🏁 [App] Inicialización completa');
    };
    init();
  }, []);

  // Removed: Aggressive periodic connection check that was logging users out unnecessarily
  // Connection issues are now handled gracefully at the operation level

  // Efecto para forzar vista de paciente si is_psychologist es false
  useEffect(() => {
    if (currentUser) {
      console.log('🔍 [App] Estado del usuario:', {
        email: currentUser.email,
        is_psychologist: currentUser.is_psychologist,
        isPsychologist: currentUser.isPsychologist,
        psychViewMode,
        viewState
      });
      
      if (currentUser.is_psychologist === false && psychViewMode === 'DASHBOARD') {
        console.log('⚠️ is_psychologist es false, forzando vista de paciente');
        setPsychViewMode('PERSONAL');
        setViewState(ViewState.CALENDAR);
        setActiveTab('calendar');
      }
    }
  }, [currentUser?.is_psychologist, psychViewMode]);
  
  // Removed: API call on every psychViewMode change was unnecessary — the user object
  // is already in state and updated on login / explicit actions. The is_psychologist
  // guard effect above already handles the only valid reason to re-check on view change.

  const loadUserData = async (userId: string) => {
    try {
      console.log('📥 Cargando datos del usuario:', userId);
      // Optimización: Solo cargar últimas 50 entradas por defecto
      const [e, g, s] = await Promise.all([
          StorageService.getEntriesForUser(userId, undefined, { limit: 50 }),
          StorageService.getGoalsForUser(userId),
          StorageService.getSettings(userId)
      ]);
      console.log('✅ Datos cargados - Entradas:', e.length, 'Metas:', g.length);
      setEntries(e);
      setGoals(g);
      setSettings(s);
    } catch (error) {
      console.error('❌ Error cargando datos del usuario:', error);
      // Establecer valores por defecto para evitar pantalla en blanco
      // La UI debe seguir funcionando aunque fallen las llamadas al servidor
      console.log('⚠️ Usando valores por defecto para datos del usuario');
      setEntries([]);
      setGoals([]);
      setSettings({ 
        notificationsEnabled: false, 
        feedbackNotificationsEnabled: true,
        notificationTime: '20:00',
        language: 'es-ES',
        voice: 'Kore' 
      });
    }
  };

  const refreshUserData = async (userId: string) => {
    try {
      console.log('🔄 Refrescando datos del usuario:', userId);
      const refreshed = await AuthService.getUserById(userId);
      if (refreshed) {
        // BUGFIX: Asegurar que is_psychologist siempre tenga un valor booleano
        if (refreshed.is_psychologist === undefined || refreshed.is_psychologist === null) {
          refreshed.is_psychologist = false;
          refreshed.isPsychologist = false;
        }
        console.log('✅ Usuario refrescado:', refreshed.email);
        // Never downgrade is_psychologist — if current state says true, keep it true
        setCurrentUser(prev => {
          if (prev?.is_psychologist === true && refreshed.is_psychologist !== true) {
            return { ...refreshed, is_psychologist: true, isPsychologist: true };
          }
          return refreshed;
        });
      }
      // Siempre cargar datos del usuario, incluso si falla la actualización
      await loadUserData(userId);
      // Solo verificar invitaciones y perfil si tenemos datos del usuario
      if (refreshed?.email) {
        try {
          await checkInvitations(refreshed.email, refreshed.id);
        } catch (invErr) {
          console.warn('⚠️ Error verificando invitaciones (no crítico):', invErr);
        }
      }
      // Check profile for both psychologists and patients
      try {
        await checkProfileComplete(userId);
      } catch (profileErr) {
        console.warn('⚠️ Error verificando perfil (no crítico):', profileErr);
      }
    } catch (e) {
      console.error('❌ Error refrescando datos del usuario:', e);
      // Don't logout on refresh errors - user can continue with cached data
      // Intentar cargar datos localmente como fallback
      try {
        console.log('⚠️ Intentando cargar datos localmente como fallback...');
        await loadUserData(userId);
      } catch (loadError) {
        console.error('❌ Error cargando datos localmente:', loadError);
        // Establecer valores por defecto para evitar pantalla en blanco
        // CRÍTICO: Nunca dejar la UI sin datos mínimos
        console.log('⚠️ Usando valores por defecto mínimos');
        setEntries([]);
        setGoals([]);
        setSettings({ 
          notificationsEnabled: false, 
          feedbackNotificationsEnabled: true,
          notificationTime: '20:00',
          language: 'es-ES',
          voice: 'Kore' 
        });
      }
    }
  };

  const loadPsychSubscription = async (userId: string) => {
    try {
      const res = await fetch(`${API_URL}/subscription?psychologist_user_id=${userId}`, {
        headers: AuthService.getAuthHeaders()
      });
      if (res.ok) {
        const info = await res.json();
        setPsychSubscriptionInfo(info);
        // Sync master flag to currentUser if server says this user is master
        // (localStorage cache may be stale from before master was set)
        if (info?.is_master === true) {
          setCurrentUser(u => u ? { ...u, master: true } : u);
        }
      }
    } catch (_) {}
  };

  const loadPatientSubscription = async (userId: string) => {
    try {
      const res = await fetch(`${API_URL}/patient-subscription?patient_user_id=${userId}`, {
        headers: AuthService.getAuthHeaders()
      });
      if (res.ok) {
        const info = await res.json();
        setPatientSubscriptionInfo(info);
        // Sync master flag to currentUser if server says this user is master
        if (info?.is_master === true) {
          setCurrentUser(u => u ? { ...u, master: true } : u);
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (currentUser?.isPsychologist && currentUser?.id) {
      loadPsychSubscription(currentUser.id);
    } else {
      setPsychSubscriptionInfo(null);
    }
    if (currentUser?.id) {
      loadPatientSubscription(currentUser.id);
    } else {
      setPatientSubscriptionInfo(null);
    }
  }, [currentUser?.id, currentUser?.isPsychologist, currentUser?.is_psychologist]);

  // Refresh subscription info when Stripe sync completes
  useEffect(() => {
    const handleStripeSynced = () => {
      if (currentUser?.isPsychologist && currentUser?.id) {
        loadPsychSubscription(currentUser.id);
      }
    };
    window.addEventListener('mainds:stripe-synced', handleStripeSynced);
    return () => window.removeEventListener('mainds:stripe-synced', handleStripeSynced);
  }, [currentUser?.id, currentUser?.isPsychologist]);

  const checkInvitations = async (email: string, userId?: string) => {
      const invites = await StorageService.getPendingInvitationsForEmail(email, userId);
      setHasPendingInvites(invites.length > 0);
  };

  const checkProfileComplete = async (userId: string, user?: User) => {
    const userToCheck = user || currentUser;
    
    if (!userToCheck) {
      setIsProfileIncomplete(false);
      return;
    }

    try {
      const endpoint = userToCheck.is_psychologist === true
        ? `${API_URL}/psychologist/${userId}/profile`
        : `${API_URL}/patient/${userId}/profile`;
      
      const response = await fetch(endpoint, { headers: AuthService.getAuthHeaders() });
      if (response.ok) {
        const profile = await response.json();
        
        // Campos esenciales según el rol
        const requiredFields = userToCheck.is_psychologist === true 
          ? [
              profile.name,
              profile.phone,
              profile.email,
              profile.businessName,
              profile.taxId,
              profile.iban
            ]
          : [
              profile.name,
              profile.phone,
              profile.email
            ];
        
        const isIncomplete = requiredFields.some(field => !field || String(field).trim() === '');
        setIsProfileIncomplete(isIncomplete);
        if (userToCheck.is_psychologist === true) {
          setShowPendingSessionsBadge(profile.show_pending_sessions_badge ?? true);
        }
      }
    } catch (error) {
      console.error('Error checking profile completeness:', error);
    }
  };

  const handleAuthSuccess = async (providedUser?: User) => {
      console.log('📍 handleAuthSuccess llamado con:', providedUser ? 'usuario proporcionado' : 'sin usuario');
      
      // Mostrar indicador de carga mientras se obtiene y cargan los datos del usuario
      setIsLoadingData(true);
      setError(''); // Limpiar errores previos
      
      // Timeout de seguridad: si después de 15 segundos aún está cargando, forzar error
      const timeoutId = setTimeout(() => {
          console.error('⏱️ Timeout: handleAuthSuccess tardó demasiado');
          setIsLoadingData(false);
          setError('La carga está tardando más de lo esperado. Por favor, recarga la página.');
          setViewState(ViewState.AUTH);
      }, 15000); // 15 segundos
      
      try {
          // Si ya tenemos el usuario (ej: desde signInWithSupabase), usarlo directamente
          let user = providedUser;
          
          if (!user) {
              console.log('🔄 Obteniendo usuario actual desde localStorage...');
              user = await AuthService.getCurrentUser();
          }
          
          if (!user) {
              console.error('❌ No se pudo obtener el usuario después de autenticación');
              clearTimeout(timeoutId);
              setCurrentUser(null);
              setViewState(ViewState.AUTH);
              setError('Error al cargar usuario. Por favor, intenta de nuevo.');
              setIsLoadingData(false);
              return;
          }
          
          // BUGFIX: Asegurar que is_psychologist siempre tenga un valor booleano
          if (user.is_psychologist === undefined || user.is_psychologist === null) {
              user.is_psychologist = false;
              user.isPsychologist = false;
          }
          
          console.log('✅ Usuario obtenido:', user.email || user.id, '| is_psychologist:', user.is_psychologist);
          
          // Establecer el usuario PRIMERO para que React pueda empezar a renderizar
          setCurrentUser(user);
          
          // Solo permitir vista de psicólogo si is_psychologist es true
          const canAccessPsychologistView = user.is_psychologist === true;
          console.log('🎯 Estableciendo vista:', canAccessPsychologistView ? 'PATIENTS' : 'CALENDAR');
          
          // Establecer la vista ANTES de cargar los datos para evitar pantalla en blanco
          setViewState(canAccessPsychologistView ? ViewState.PATIENTS : ViewState.CALENDAR);
          setPsychViewMode(canAccessPsychologistView ? 'DASHBOARD' : 'PERSONAL');

          // If the URL has ?sign_document=<id>, navigate the patient directly to their documents tab
          const urlParams = new URLSearchParams(window.location.search);
          const signDocParam = urlParams.get('sign_document');
          if (!canAccessPsychologistView && signDocParam) {
            setActiveTab('documents');
            // Clean up the param from the URL without reloading
            urlParams.delete('sign_document');
            const newSearch = urlParams.toString();
            history.replaceState(null, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));
          } else {
            setActiveTab(canAccessPsychologistView ? 'dashboard' : 'calendar');
          }
          
          // Desactivar loading ANTES de cargar datos para mostrar la UI
          // Los datos se cargarán en segundo plano
          setIsLoadingData(false);
          clearTimeout(timeoutId);

          // Mostrar popup de rol la primera vez que el usuario inicia sesión
          const rolePromptKey = `role_prompt_shown_${user.id}`;
          if (!localStorage.getItem(rolePromptKey) && user.is_psychologist !== true) {
            setShowFirstTimeRoleModal(true);
          }

          // Pedir teléfono si es psicólogo y no tiene número guardado
          if (canAccessPsychologistView && !user.phone) {
            setShowPhonePrompt(true);
          }
          
          // Cargar datos del usuario EN SEGUNDO PLANO
          // Esto permite que la UI se muestre inmediatamente
          console.log('📥 Cargando datos de usuario en segundo plano...');
          try {
              await refreshUserData(user.id);
              console.log('✅ Datos de usuario cargados');
          } catch (refreshErr) {
              console.error('❌ Error refrescando datos (no crítico):', refreshErr);
              // No lanzar el error, la UI ya está visible
          }
          
          console.log('✅ handleAuthSuccess completado exitosamente');
      } catch (err) {
          console.error('❌ Error en handleAuthSuccess:', err);
          clearTimeout(timeoutId);
          setError('Error al cargar datos del usuario. Por favor, intenta de nuevo.');
          setViewState(ViewState.AUTH);
          setCurrentUser(null);
          setIsLoadingData(false);
      }
  };

  const handleLogout = () => {
      AuthService.logout();
      setCurrentUser(null);
      setEntries([]);
      setGoals([]);
      setPsychViewMode('DASHBOARD');
      setSelectedDate(null);
      setHasPendingInvites(false);
      setViewState(ViewState.AUTH);
  };

  const handleUserUpdate = async (updatedUser: User) => {
      setCurrentUser(updatedUser);
      // Update localStorage cache immediately so refreshes don't regress
      localStorage.setItem('ai_diary_user_cache', JSON.stringify(updatedUser));
      
      // Refrescar datos del usuario desde el servidor
      if (updatedUser.id) {
        try {
          const freshUser = await AuthService.getUserById(updatedUser.id);
          if (freshUser) {
            // Never downgrade fields we just explicitly set (e.g. is_psychologist)
            const merged: User = {
              ...freshUser,
              is_psychologist: updatedUser.is_psychologist || freshUser.is_psychologist,
              isPsychologist: updatedUser.is_psychologist || freshUser.is_psychologist,
            };
            setCurrentUser(merged);
            localStorage.setItem('ai_diary_user_cache', JSON.stringify(merged));
            console.log('🔄 Usuario refrescado desde servidor:', {
              email: merged.email,
              is_psychologist: merged.is_psychologist
            });
            updatedUser = merged;
          }
        } catch (err) {
          console.warn('No se pudo refrescar usuario:', err);
        }
      }
      
      // Solo permitir acceso a vista de psicólogo si is_psychologist es true
      if (updatedUser.is_psychologist === true) {
        setViewState(ViewState.PATIENTS);
        setPsychViewMode('DASHBOARD');
      } else {
        // Si is_psychologist es false O es un paciente, forzar vista de paciente
        setViewState(ViewState.CALENDAR);
        setPsychViewMode('PERSONAL');
        setActiveTab('calendar');
      }
  };

    const handleOpenSettings = () => {
      // Abrimos rápido y refrescamos datos en segundo plano para evitar bloqueo de la UI
      setShowSettings(true);
      if (currentUser) {
        refreshUserData(currentUser.id).catch(err => console.warn('No se pudo refrescar antes de ajustes', err));
      }
    };

    const handleSetRole = async (role: 'PATIENT' | 'PSYCHOLOGIST') => {
      if (!currentUser) return;
      const updated = { ...currentUser, is_psychologist: role === 'PSYCHOLOGIST', isPsychologist: role === 'PSYCHOLOGIST' } as User;
      try {
        await AuthService.updateUser(updated);
        setCurrentUser(updated);
        setShowRolePrompt(false);
        setShowFirstTimeRoleModal(false);
        setPendingRole(null);
        await loadUserData(updated.id);
        await checkInvitations(updated.email);
        setViewState(updated.is_psychologist === true ? ViewState.PATIENTS : ViewState.CALENDAR);
        if (updated.is_psychologist === true) setPsychViewMode('DASHBOARD');
      } catch (err:any) {
        console.error('Error updating role', err);
        alert(err?.message || 'Error guardando el rol.');
      }
    };

    const handleConfirmRole = async () => {
      if (!pendingRole) return;
      await handleSetRole(pendingRole);
    };

    const handleSavePhone = async () => {
      if (!currentUser || !phonePromptNumber.trim()) return;
      setPhonePromptSaving(true);
      try {
        const digits = phonePromptNumber.trim().replace(/^0/, '');
        const fullPhone = `${phonePromptPrefix}${digits}`;
        const res = await AuthService.apiFetch(`${API_URL}/users/${currentUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: fullPhone }),
        });
        if (res.ok) {
          setCurrentUser(prev => prev ? { ...prev, phone: fullPhone } : prev);
          setShowPhonePrompt(false);
          setPhonePromptNumber('');
        }
      } catch (err) {
        console.error('Error guardando teléfono:', err);
      } finally {
        setPhonePromptSaving(false);
      }
    };

  useEffect(() => {
    if (!settings.notificationsEnabled || !currentUser) return;
    // Verificar que Notification API esté disponible (no siempre en iOS)
    if (typeof Notification === 'undefined') return;
    
    const checkTime = async () => {
      const now = new Date();
      const currentHm = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      if (currentHm === settings.notificationTime && now.getSeconds() < 10) {
        if (Notification.permission === 'granted') {
           const targetUrl = `${window.location.origin}/?start=voice`;
           if ('serviceWorker' in navigator) {
             const reg = await navigator.serviceWorker.getRegistration();
             if (reg) {
               reg.showNotification('mainds', {
                 body: 'Es momento de conectar contigo. ¿Qué tal tu día?',
                 data: { url: targetUrl }
               });
               return;
             }
           }
           const n = new Notification('mainds', { body: 'Es momento de conectar contigo. ¿Qué tal tu día?', data: { url: targetUrl } as any });
           n.onclick = () => {
             window.location.href = targetUrl;
           };
        }
      }
    };
    const interval = setInterval(checkTime, 10000);
    return () => clearInterval(interval);
  }, [settings, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('start') !== 'voice') return;
    setSelectedDate(null);
    setActiveTab('insights');
    setViewState(ViewState.VOICE_SESSION);
    const url = new URL(window.location.href);
    url.searchParams.delete('start');
    window.history.replaceState({}, '', url.toString());
  }, [currentUser]);

  // Handle Stripe checkout return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeParam = params.get('stripe');
    if (!stripeParam) return;
    // Clean URL immediately
    const url = new URL(window.location.href);
    url.searchParams.delete('stripe');
    window.history.replaceState({}, '', url.toString());
    if (stripeParam === 'success') {
      setStripeNotification('success');
      // Restore the panel the user was on before going to Stripe
      const returnPanel = localStorage.getItem('mainds_stripe_return_panel');
      const validPanels = ['patients', 'billing', 'profile', 'dashboard', 'sessions', 'schedule', 'centros', 'templates', 'import', 'ai-assistant', 'connections', 'materials'];
      if (returnPanel && validPanels.includes(returnPanel)) {
        setPsychPanelView(returnPanel as any);
      }
      localStorage.removeItem('mainds_stripe_return_panel');
      // Mark in sessionStorage so components can detect Stripe return even after first render
      sessionStorage.setItem('mainds_stripe_return', '1');
      // Sync subscription directly from Stripe (webhooks don't reach localhost in dev)
      const syncAndRefresh = async () => {
        try {
          const { getCurrentUser, getAuthHeaders } = await import('./services/authService');
          const user = await getCurrentUser();
          if (user?.id) {
            const { API_URL } = await import('./services/config');
            await fetch(`${API_URL}/stripe/sync-subscription`, {
              method: 'POST',
              headers: getAuthHeaders()
            });
          }
          if (user) setCurrentUser(user);
          // Auto-open Settings so the user sees the updated subscription status
          setShowSettings(true);
          // Notify components to refresh data after subscription activation
          window.dispatchEvent(new CustomEvent('mainds:stripe-synced'));
        } catch (_) {}
      };
      // Give enough time for auth init + component mount before syncing
      setTimeout(syncAndRefresh, 3000);
      // Auto-dismiss after 8s
      setTimeout(() => setStripeNotification(null), 8000);
    } else if (stripeParam === 'cancel') {
      setStripeNotification('cancel');
      setTimeout(() => setStripeNotification(null), 5000);
    }
  }, []);

  const markFeedbackAsRead = async (entriesToMark: JournalEntry[]) => {
    if (entriesToMark.length === 0) return;
    const now = Date.now();
    const ids = new Set(entriesToMark.map(e => e.id));
    setEntries(prev => prev.map(e => ids.has(e.id) ? { ...e, psychologistFeedbackReadAt: now } : e));
    try {
      await Promise.all(entriesToMark.map(e => StorageService.updateEntry({ ...e, psychologistFeedbackReadAt: now })));
    } catch (err) {
      console.warn('No se pudo marcar feedback como leído.', err);
    }
  };

  // Note: feedback is marked as read when the user opens the entry detail.

  useEffect(() => {
    if (!currentUser) return;
    if (!settings.feedbackNotificationsEnabled) return;
    // Verificar que Notification API esté disponible (no siempre en iOS)
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const storageKey = `mainds_feedback_notified_${currentUser.id}`;
    const raw = localStorage.getItem(storageKey);
    const notifiedMap = raw ? JSON.parse(raw) as Record<string, number> : {};

    const newlyUpdated = entries
      .filter(hasFeedbackContent)
      .filter(entry => {
        const updatedAt = entry.psychologistFeedbackUpdatedAt || 0;
        if (!updatedAt) return false;
        const lastNotified = notifiedMap[entry.id] || 0;
        return updatedAt > lastNotified && isFeedbackUnread(entry);
      });

    if (newlyUpdated.length === 0) return;

    newlyUpdated.forEach(entry => {
      new Notification('Nuevo feedback del psicólogo', { body: 'Tienes un nuevo feedback disponible.' });
      if (entry.psychologistFeedbackUpdatedAt) {
        notifiedMap[entry.id] = entry.psychologistFeedbackUpdatedAt;
      }
    });

    localStorage.setItem(storageKey, JSON.stringify(notifiedMap));
  }, [currentUser, settings.feedbackNotificationsEnabled, entries]);

  useEffect(() => {
    if (!currentUser) return;
    if (!selectedEntryId) return;
    const entry = entries.find(e => e.id === selectedEntryId);
    if (!entry) return;
    const hasFeedback = hasFeedbackContent(entry);
    if (!hasFeedback) return;
    if (!isFeedbackUnread(entry)) return;
    markFeedbackAsRead([entry]);
  }, [selectedEntryId, entries, currentUser]);

  const handleStartSession = (dateStr?: string | React.MouseEvent) => {
    if (!patientCanUseVoice) {
      setShowPatientUpgradeModal(true);
      return;
    }
    const safeDate = typeof dateStr === 'string' ? dateStr : null;
    setSessionDate(safeDate);
    setSelectedDate(null);
    setViewState(ViewState.VOICE_SESSION);
  };

  const handleSessionEnd = async (transcript: string) => {
    console.log('[App] 📥 handleSessionEnd called with transcript length:', transcript?.length);
    console.log('[App] 📄 Transcript preview:', transcript?.substring(0, 200));
    
    if (!currentUser) return;
    
    console.log('[App] 📝 Received transcript length:', transcript?.length || 0);
    console.log('[App] 📝 Transcript preview:', transcript?.substring(0, 200) || '(empty)');
    console.log('[App] 📝 Full transcript:', transcript);
    
    // Verificar con umbral muy bajo (solo 3 caracteres)
    if (!transcript || transcript.trim().length < 3) {
        console.error('[App] ❌ Transcript too short or empty, cancelling save');
        console.error('[App] Transcript received:', transcript);
        console.error('[App] Possible causes: microphone not working, permissions denied, or transcription failed');
        setViewState(ViewState.CALENDAR);
        setTimeout(() => {
            alert("No se detectó suficiente audio en la grabación.\n\nPosibles causas:\n• Permisos de micrófono no otorgados\n• Micrófono no funcionando\n• Problema con el reconocimiento de voz\n• La sesión fue muy corta\n\nPor favor, revisa los permisos del navegador e intenta de nuevo.");
        }, 100);
        return;
    }
    
    console.log('[App] ✅ Transcript valid, proceeding to save...');

    setViewState(ViewState.CALENDAR); 
    setIsProcessing(true);
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const targetDate = sessionDate || today;
      
      console.log('[App] 🧠 Analyzing transcript with date:', targetDate);
      const newEntry = await analyzeJournalEntry(transcript, targetDate, currentUser.id);
      console.log('[App] ✅ Analysis complete, entry created:', newEntry.id);
      
      try {
        console.log('[App] 💾 Saving entry to storage...');
        await StorageService.saveEntry(newEntry);
        console.log('[App] ✅ Entry saved successfully');
      } catch (err:any) {
        console.error('[App] ❌ Error saving entry', err);
        alert(err?.message || 'Error guardando la entrada. Comprueba la conexión con el servidor.');
        setIsProcessing(false);
        return;
      }
      
      const updatedEntries = await StorageService.getEntriesForUser(currentUser.id);
      setEntries(updatedEntries);
      
      // No abrir el modal automáticamente después de guardar una sesión de voz
      // setSelectedDate(targetDate);
      setSessionDate(null);
    } catch (error) {
      console.error('[App] ❌ Error in handleSessionEnd:', error);
      alert("Hubo un error guardando tu diario.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddGoal = async (desc: string) => {
    if (!currentUser) return;
    const newGoal: Goal = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      description: desc,
      createdAt: Date.now(),
      completed: false,
      createdBy: 'USER'
    };
    const prev = goals;
    const updated = [...prev, newGoal];
    setGoals(updated);
    try {
      await StorageService.saveUserGoals(currentUser.id, updated);
    } catch (err: any) {
      console.error('Error saving goals', err);
      setGoals(prev);
      alert(err?.message || 'Error guardando la meta. Comprueba la conexión con el servidor.');
    }
  };

  const handleToggleGoal = async (id: string) => {
    if (!currentUser) return;
    const prev = goals;
    const updated = goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g);
    setGoals(updated);
    try {
      await StorageService.saveUserGoals(currentUser.id, updated);
    } catch (err: any) {
      console.error('Error toggling goal', err);
      setGoals(prev);
      alert(err?.message || 'Error actualizando la meta. Comprueba la conexión con el servidor.');
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!currentUser) return;
    const prev = goals;
    const updated = goals.filter(g => g.id !== id);
    setGoals(updated);
    try {
      await StorageService.saveUserGoals(currentUser.id, updated);
    } catch (err: any) {
      console.error('Error deleting goal', err);
      setGoals(prev);
      alert(err?.message || 'Error eliminando la meta. Comprueba la conexión con el servidor.');
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!currentUser) return;
    try {
      await StorageService.deleteEntry(id);
      const updated = await StorageService.getEntriesForUser(currentUser.id);
      setEntries(updated);
    } catch (err:any) {
      console.error('Error deleting entry', err);
      alert(err?.message || 'No se pudo eliminar la entrada.');
    }
  };

  const handleUpdateEntry = async (entry: JournalEntry) => {
    if (!currentUser) return;
    await StorageService.updateEntry(entry);
    const updated = await StorageService.getEntriesForUser(currentUser.id);
    setEntries(updated);
  };

  const handleGenerateReport = async () => {
    if (!currentUser) return;
    setIsProcessing(true);
    try {
      const last7Days = await StorageService.getLastDaysEntries(currentUser.id, 7);
      if (last7Days.length < 2) {
        alert("Necesitas al menos 2 entradas recientes.");
        return;
      }
      const report = await generateWeeklyReport(last7Days);
      setWeeklyReport(report);
    } catch (e) {
      alert("Error generando el reporte.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveSettings = async (newSettings: UserSettings) => {
    if (!currentUser) return;
    const prev = settings;
    setSettings(newSettings);
    try {
      await StorageService.saveSettings(currentUser.id, newSettings);
    } catch (err:any) {
      console.error('Error saving settings', err);
      setSettings(prev);
      alert(err?.message || 'Error guardando ajustes. Comprueba la conexión con el servidor.');
      throw err;
    }
  };

const safeEntries = Array.isArray(entries) ? entries : [];

const dayEntries = selectedDate
  ? safeEntries.filter(e => e.date === selectedDate)
      .filter(e => {
        // Mostrar entradas del usuario (diario)
        if (e.createdBy !== 'PSYCHOLOGIST') return true;
        // Mostrar sesiones y feedback del psicólogo (formatos antiguo y nuevo)
        if (e.psychologistEntryType === 'SESSION' || e.psychologistEntryType === 'FEEDBACK') return true;
        if (e.entryType === 'feedback') return true;
        // NO mostrar notas internas
        return false;
      })
  : [];

const entriesForModal = selectedEntryMode === 'single' && selectedEntryId
  ? (safeEntries.find(e => e.id === selectedEntryId) ? [safeEntries.find(e => e.id === selectedEntryId)!] : [])
  : dayEntries;

const safeGoals = Array.isArray(goals) ? goals : [];

const assignedGoals = safeGoals.filter(
  g => g.createdBy === 'PSYCHOLOGIST'
);

const personalGoals = safeGoals.filter(
  g => g.createdBy !== 'PSYCHOLOGIST'
);

const feedbackEntries = [...safeEntries]
  .filter(e => hasFeedbackContent(e) || e.psychologistEntryType === 'FEEDBACK' || e.entryType === 'feedback')
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

const isSessionEntry = (entry: JournalEntry) => {
  if (entry.psychologistEntryType === 'SESSION') return true;
  // Incluir entradas de feedback creadas por el psicólogo
  if (entry.entryType === 'feedback' && entry.createdBy === 'PSYCHOLOGIST') return true;
  if (entry.createdBy === 'PSYCHOLOGIST') {
    return Boolean(entry.transcript && entry.transcript.trim().length > 0);
  }
  return false;
};

const sessionEntries = [...safeEntries]
  .filter(isSessionEntry)
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

const latestDiaryEntry = [...safeEntries]
  .filter(e => e.createdBy !== 'PSYCHOLOGIST')
  .filter(e => e.transcript && e.transcript.trim().length > 0)
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

const latestSessionEntry = [...safeEntries]
  .filter(e => e.createdBy === 'PSYCHOLOGIST')
  .filter(e => e.psychologistEntryType === 'SESSION')
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

const todayStr = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
})();

const hasTodayEntry = safeEntries.some(e => e.createdBy !== 'PSYCHOLOGIST' && e.date === todayStr);

  const unreadFeedbackCount = feedbackEntries.filter(isFeedbackUnread).length;

  // Contar entradas de diario (sin sentimentScore ya que se eliminó)
  const diaryEntries = safeEntries.filter(e => e.createdBy !== 'PSYCHOLOGIST');
  const totalEntriesCount = diaryEntries.length;
  const totalSessionsCount = sessionEntries.length;

  
  const ProfileCircle = ({ onClick, className }: { onClick: () => void, className?: string }) => (
    <button onClick={onClick} className={`relative rounded-full overflow-hidden transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${className}`}>
        {currentUser?.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="Perfil" className="w-10 h-10 object-cover" />
        ) : (
            <div className="w-10 h-10 bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg">
                {currentUser?.name?.charAt(0).toUpperCase()}
            </div>
        )}
        {hasPendingInvites && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>}
    </button>
  );

  // Superadmin View - Solo para garryjavi@gmail.com y daniel.m.mendezv@gmail.com
  const SUPERADMIN_EMAILS_FRONTEND = ['garryjavi@gmail.com', 'daniel.m.mendezv@gmail.com'];
  const isSuperAdminUser = SUPERADMIN_EMAILS_FRONTEND.includes(currentUser?.email?.toLowerCase() || '');

  if (psychViewMode === 'ADMIN' && isSuperAdminUser) {
    const goBackFromAdmin = () => setPsychViewMode(currentUser?.is_psychologist === true ? 'DASHBOARD' : 'PERSONAL');
    const adminNavItems = [
      { id: 'dashboard' as const, label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { id: 'users'     as const, label: 'Usuarios',  icon: <Users size={18} /> },
    ] as { id: 'dashboard' | 'users'; label: string; icon: React.ReactNode }[];
    return (
      <div className="h-screen bg-slate-50 text-slate-900 flex flex-col overflow-hidden">
        {/* ── Mobile top bar ─────────────────────────── */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
          <button
            onClick={() => setAdminSidebarOpen(o => !o)}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield size={15} className="text-white" />
          </div>
          <span className="font-bold text-white text-base flex-1">Superadmin</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {adminNavItems.find(n => n.id === adminTab)?.label}
          </span>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Sidebar overlay (mobile) ────────────────── */}
          {adminSidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setAdminSidebarOpen(false)}
            />
          )}

          {/* ── Sidebar ──────────────────────────────────── */}
          <aside className={`
            fixed md:static inset-y-0 left-0 z-50
            w-64 bg-slate-900 flex flex-col flex-shrink-0
            transform transition-transform duration-200 ease-in-out
            ${adminSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
          `}>
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Shield size={18} className="text-white" />
                </div>
                <span className="font-bold text-white text-lg">Superadmin</span>
              </div>
              <button
                onClick={() => setAdminSidebarOpen(false)}
                className="md:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {adminNavItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setAdminTab(item.id); setAdminSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                    adminTab === item.id
                      ? 'bg-red-900/40 text-red-300 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>

            {/* Footer */}
            <div className="p-3 border-t border-slate-700">
              <button
                onClick={goBackFromAdmin}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <ArrowLeftRight size={16} />
                <span>{currentUser?.is_psychologist === true ? 'Volver a mainds pro' : 'Volver a mi diario'}</span>
              </button>
            </div>
          </aside>

          {/* ── Main Content ─────────────────────────────── */}
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
            <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}>
              <SuperAdmin tab={adminTab} />
            </Suspense>
          </main>
        </div>
      </div>
    );
  }

  // Psychologist View - Solo accesible si is_psychologist es true
  if (currentUser?.is_psychologist === true && psychViewMode === 'DASHBOARD') {
      console.log('✅ [App] Mostrando vista de psicólogo - is_psychologist:', currentUser.is_psychologist);
      
      // Handler para cambio de vista con cierre de modal si estamos en pacientes
      const handleViewChange = (newView: typeof psychPanelView) => {
        // Si estamos cambiando a 'patients' y ya estamos en 'patients', cerrar modal
        if (newView === 'patients' && psychPanelView === 'patients') {
          patientDashboardRef.current?.closeModal();
        }
        setPsychPanelView(newView);
      };
      
      return (
          <div className="h-screen bg-slate-50 text-slate-900 flex overflow-hidden">
               {/* Phone prompt modal for psychologists without a phone number */}
               {showPhonePrompt && (
                 <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                   <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
                     <div className="flex items-center gap-3 mb-4">
                       <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                         <Phone size={20} className="text-indigo-600" />
                       </div>
                       <div>
                         <h2 className="text-lg font-bold text-slate-800">Añade tu teléfono</h2>
                         <p className="text-xs text-slate-500">Lo necesitamos para tu perfil profesional.</p>
                       </div>
                     </div>
                     <div className="flex gap-2 mb-4 min-w-0">
                       <select
                         value={phonePromptPrefix}
                         onChange={e => setPhonePromptPrefix(e.target.value)}
                         className="border border-slate-200 rounded-xl px-2 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-slate-50 w-24 flex-shrink-0"
                       >
                         <option value="+34">🇪🇸 +34</option>
                         <option value="+52">🇲🇽 +52</option>
                         <option value="+54">🇦🇷 +54</option>
                         <option value="+57">🇨🇴 +57</option>
                         <option value="+56">🇨🇱 +56</option>
                         <option value="+51">🇵🇪 +51</option>
                         <option value="+58">🇻🇪 +58</option>
                         <option value="+593">🇪🇨 +593</option>
                         <option value="+591">🇧🇴 +591</option>
                         <option value="+598">🇺🇾 +598</option>
                         <option value="+595">🇵🇾 +595</option>
                         <option value="+55">🇧🇷 +55</option>
                         <option value="+351">🇵🇹 +351</option>
                         <option value="+1">🇺🇸 +1</option>
                         <option value="+44">🇬🇧 +44</option>
                         <option value="+49">🇩🇪 +49</option>
                         <option value="+33">🇫🇷 +33</option>
                         <option value="+39">🇮🇹 +39</option>
                       </select>
                       <input
                         type="tel"
                         placeholder="600 000 000"
                         value={phonePromptNumber}
                         onChange={e => setPhonePromptNumber(e.target.value)}
                         onKeyDown={e => { if (e.key === 'Enter' && phonePromptNumber.trim()) handleSavePhone(); }}
                         className="flex-1 min-w-0 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                         autoFocus
                       />
                     </div>
                     <div className="flex gap-2">
                       <button
                         type="button"
                         onClick={() => setShowPhonePrompt(false)}
                         className="flex-1 py-3 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                       >
                         Ahora no
                       </button>
                       <button
                         type="button"
                         onClick={handleSavePhone}
                         disabled={!phonePromptNumber.trim() || phonePromptSaving}
                         className="flex-1 py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
                       >
                         {phonePromptSaving ? <Loader2 size={15} className="animate-spin" /> : null}
                         Guardar
                       </button>
                     </div>
                   </div>
                 </div>
               )}
               {/* Stripe payment notification banner */}
               {stripeNotification === 'success' && (
                 <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300" role="alert">
                   <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                   <span className="font-medium text-sm">¡Suscripción activada correctamente! Ya puedes añadir pacientes ilimitados.</span>
                   <button onClick={() => setStripeNotification(null)} className="ml-2 text-white/70 hover:text-white" aria-label="Cerrar">✕</button>
                 </div>
               )}
               {stripeNotification === 'cancel' && (
                 <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-slate-700 text-white px-6 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300" role="alert">
                   <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                   <span className="font-medium text-sm">Pago cancelado. Puedes activar la suscripción cuando quieras.</span>
                   <button onClick={() => setStripeNotification(null)} className="ml-2 text-white/70 hover:text-white" aria-label="Cerrar">✕</button>
                 </div>
               )}
               {/* Sidebar */}
               <PsychologistSidebar 
                  activeView={psychPanelView}
                  onViewChange={handleViewChange}
                  isOpen={sidebarOpen}
                  onToggle={() => setSidebarOpen(!sidebarOpen)}
                  userName={currentUser.name}
                  userEmail={currentUser.email}
                  avatarUrl={currentUser.avatarUrl}
                  onSwitchToPersonal={() => { setPsychViewMode('PERSONAL'); setActiveTab('calendar'); }}
                  onOpenSettings={handleOpenSettings}
                  onSwitchToAdmin={() => setPsychViewMode('ADMIN')}
                  isProfileIncomplete={isProfileIncomplete}
                  subscriptionInfo={psychSubscriptionInfo}
                  psychologistId={currentUser.id}
                  onNeedUpgrade={() => setShowAppUpgradeModal(true)}
                  showPendingBadge={showPendingSessionsBadge}
               />
               
               {/* Main Content */}
               <div className="flex-1 overflow-y-auto px-4 md:px-8 py-2 md:py-3">
                    {/* Mobile Header with page titles, icon and description */}
                    <header className="lg:hidden mb-3">
                      <div className="flex items-center gap-3 mb-2">
                        {psychPanelView === 'dashboard' && <LayoutDashboard className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'patients' && <Users className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'billing' && <FileText className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'profile' && <UserIcon className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'schedule' && <CalendarIcon className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'connections' && <Link2 className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'sessions' && <FileText className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'centros' && <Building2 className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'templates' && <FileText className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'materials' && <FolderOpen className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'import' && <Upload className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'ai-assistant' && <Bot className="w-6 h-6 text-violet-600" />}
                        <h1 className="text-2xl font-bold text-slate-900">
                          {psychPanelView === 'dashboard' && 'Métricas'}
                          {psychPanelView === 'patients' && 'Pacientes'}
                          {psychPanelView === 'billing' && 'Facturación'}
                          {psychPanelView === 'profile' && 'Mi Perfil'}
                          {psychPanelView === 'schedule' && 'Agenda'}
                          {psychPanelView === 'connections' && 'Conexiones'}
                          {psychPanelView === 'sessions' && 'Sesiones'}
                          {psychPanelView === 'centros' && 'Centros'}
                          {psychPanelView === 'templates' && 'Consentimientos'}
                          {psychPanelView === 'materials' && 'Materiales'}
                          {psychPanelView === 'import' && 'Importar Pacientes'}
                          {psychPanelView === 'ai-assistant' && 'Asistente IA'}
                        </h1>
                      </div>
                      <p className="text-sm text-slate-500">
                        {psychPanelView === 'dashboard' && 'Métricas y resumen de actividad'}
                        {psychPanelView === 'patients' && 'Gestiona tu lista de pacientes'}
                        {psychPanelView === 'billing' && 'Gestiona facturas y pagos'}
                        {psychPanelView === 'profile' && 'Información personal y datos de facturación'}
                        {psychPanelView === 'schedule' && 'Vista semanal de tu agenda'}
                        {psychPanelView === 'connections' && 'Gestiona quién puede verte y a quién acompañas'}
                        {psychPanelView === 'sessions' && 'Gestión de sesiones'}
                        {psychPanelView === 'centros' && 'Gestiona tus centros de trabajo'}
                        {psychPanelView === 'templates' && 'Crea y envía documentos y consentimientos a pacientes'}
                        {psychPanelView === 'materials' && 'Gestiona y envía materiales a tus pacientes como feedback'}
                        {psychPanelView === 'ai-assistant' && 'Consultas, reportes y asistencia con IA privada'}
                      </p>
                    </header>

                    {/* Desktop Header */}
                    <header className="hidden lg:flex justify-between items-center mb-3">
                      <div>
                        <h1 className="text-3xl font-bold text-slate-900">
                          {psychPanelView === 'dashboard' && 'Dashboard'}
                          {psychPanelView === 'patients' && 'Pacientes'}
                          {psychPanelView === 'billing' && 'Facturación'}
                          {psychPanelView === 'profile' && 'Mi Perfil Profesional'}
                          {psychPanelView === 'schedule' && 'Agenda'}
                          {psychPanelView === 'connections' && 'Conexiones'}
                          {psychPanelView === 'sessions' && 'Sesiones'}
                          {psychPanelView === 'centros' && 'Centros'}
                          {psychPanelView === 'templates' && 'Consentimientos'}
                          {psychPanelView === 'materials' && 'Materiales'}
                          {psychPanelView === 'import' && 'Importar Pacientes'}
                          {psychPanelView === 'ai-assistant' && 'Asistente IA'}
                        </h1>
                        <p className="text-slate-500 mt-1">
                          {psychPanelView === 'dashboard' && 'Resumen completo de tu actividad profesional'}
                          {psychPanelView === 'patients' && 'Gestiona tu lista de pacientes y su progreso'}
                          {psychPanelView === 'billing' && 'Gestiona facturas y pagos de tus servicios'}
                          {psychPanelView === 'profile' && 'Información personal y datos de facturación'}
                          {psychPanelView === 'schedule' && 'Vista semanal de tu agenda con filtros'}
                          {psychPanelView === 'connections' && 'Gestiona quién puede verte y a quién acompañas'}
                          {psychPanelView === 'sessions' && 'Gestión completa de sesiones con métricas'}
                          {psychPanelView === 'centros' && 'Gestiona los centros donde ofreces tus servicios'}
                          {psychPanelView === 'templates' && 'Crea templates, consentimientos y envíalos a pacientes para su firma'}
                          {psychPanelView === 'materials' && 'Gestiona y envía materiales a tus pacientes como feedback'}
                          {psychPanelView === 'ai-assistant' && 'Consulta, genera reportes y solicita análisis con IA sobre tus datos — solo tú tienes acceso'}
                        </p>
                      </div>
                      {/* Action Buttons */}
                      <div className="flex gap-3">
                        {psychPanelView === 'schedule' && (
                          <>
                            <button
                              onClick={() => {
                                if (!psychCanCreate) { setShowAppUpgradeModal(true); return; }
                                const calendar = document.querySelector('[data-calendar-component]') as any;
                                if (calendar && calendar.openNewAvailability) calendar.openNewAvailability();
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-md"
                            >
                              <Clock size={18} />
                              Añadir Disponibilidad
                            </button>
                            <button
                              onClick={() => {
                                if (!psychCanCreate) { setShowAppUpgradeModal(true); return; }
                                const calendar = document.querySelector('[data-calendar-component]') as any;
                                if (calendar && calendar.openNewSession) calendar.openNewSession();
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
                            >
                              <Plus size={18} />
                              Nueva Sesión
                            </button>
                          </>
                        )}
                        {psychPanelView === 'centros' && (
                          <button
                            onClick={() => {
                              if (!psychCanCreate) { setShowAppUpgradeModal(true); return; }
                              centrosPanelRef.current?.openNewCenter();
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
                          >
                            <Plus size={18} />
                            Nuevo Centro
                          </button>
                        )}
                      </div>
                    </header>

                    {psychPanelView === 'dashboard' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><PsychologistDashboard psychologistId={currentUser.id} /></Suspense>}
                    {psychPanelView === 'patients' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><PatientDashboard ref={patientDashboardRef} onImportClick={() => setPsychPanelView('import')} canCreate={psychCanCreate} onNeedUpgrade={() => setShowAppUpgradeModal(true)} /></Suspense>}
                    {psychPanelView === 'sessions' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><SessionsList psychologistId={currentUser.id} /></Suspense>}
                    {psychPanelView === 'billing' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><BillingPanel psychologistId={currentUser.id} canCreate={psychCanCreate} onNeedUpgrade={() => setShowAppUpgradeModal(true)} /></Suspense>}
                    {psychPanelView === 'centros' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><CentrosPanel ref={centrosPanelRef} psychologistId={currentUser.id} canCreate={psychCanCreate} onNeedUpgrade={() => setShowAppUpgradeModal(true)} /></Suspense>}
                    {psychPanelView === 'profile' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><PsychologistProfilePanel userId={currentUser.id} userEmail={currentUser.email} onBadgeSettingChange={setShowPendingSessionsBadge} /></Suspense>}
                    {psychPanelView === 'schedule' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><PsychologistSchedule psychologistId={currentUser.id} canCreate={psychCanCreate} onNeedUpgrade={() => setShowAppUpgradeModal(true)} onOpenSettings={handleOpenSettings} /></Suspense>}
                    {psychPanelView === 'ai-assistant' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><PsychologistAIChat psychologistId={currentUser.id} psychologistName={currentUser.name} /></Suspense>}
                    {psychPanelView === 'connections' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><ConnectionsPanel currentUser={currentUser} /></Suspense>}
                    {psychPanelView === 'templates' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><TemplatesPanel psychologistId={currentUser.id} canCreate={psychCanCreate} onNeedUpgrade={() => setShowAppUpgradeModal(true)} /></Suspense>}
                    {psychPanelView === 'materials' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><PsychologistMaterialsPanel psychologistId={currentUser.id} /></Suspense>}
                    {psychPanelView === 'import' && <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}><BulkImportPanel psychologistId={currentUser.id} currentUser={currentUser} canCreate={psychCanCreate} onNeedUpgrade={() => setShowAppUpgradeModal(true)} onImportComplete={() => setPsychPanelView('patients')} /></Suspense>}

                    {showSettings && (
                         <SettingsModal 
                             settings={settings} 
                             onSave={handleSaveSettings} 
                             onClose={() => { setShowSettings(false); if(currentUser) checkInvitations(currentUser.email); }} 
                             onLogout={handleLogout}
                             onUserUpdate={handleUserUpdate}
                         />
                    )}
                    {showAppUpgradeModal && currentUser && (
                      <UpgradeModal
                        currentUser={currentUser}
                        trialDaysLeft={psychSubscriptionInfo?.trial_days_left ?? 0}
                        onClose={() => setShowAppUpgradeModal(false)}
                        returnPanel={psychPanelView}
                        currentPlanId={psychSubscriptionInfo?.plan_id}
                        activeRelations={psychSubscriptionInfo?.active_relations}
                      />
                    )}
               </div>
          </div>
      );
  }

  if (viewState === ViewState.AUTH) {
      return (
        <>
          <AuthScreen onAuthSuccess={handleAuthSuccess} pendingSignDocumentId={pendingSignDocumentId} />
          {error && (
            <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg max-w-md">
              {error}
            </div>
          )}
        </>
      );
  }

  if (isLoadingData) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 p-4">
              <div className="text-center">
                  <div className="mb-6 flex justify-center">
                      <MaindsLogo className="w-24 h-24 text-indigo-600 animate-pulse" />
                  </div>
                  <h1 className="text-4xl font-bold text-indigo-600 tracking-tight mb-4 font-mainds">mainds</h1>
                  <div className="relative w-64 h-2 bg-indigo-100 rounded-full overflow-hidden mx-auto mb-3">
                      <div className="absolute top-0 left-0 h-full bg-indigo-600 rounded-full animate-[loading_1.5s_ease-in-out_infinite]"></div>
                  </div>
                  <p className="text-slate-500 text-sm">Cargando tu información...</p>
              </div>
              <style>{`
                  @keyframes loading {
                      0% { width: 0%; }
                      50% { width: 70%; }
                      100% { width: 100%; }
                  }
              `}</style>
          </div>
      );
  }

  // Patient View
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-0">
      {showFirstTimeRoleModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-bold text-slate-800">¡Bienvenido/a a mainds!</h2>
            <p className="text-slate-600 mt-2 text-sm">¿Eres psicólogo/a? Podemos configurar tu cuenta ahora.</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  localStorage.setItem(`role_prompt_shown_${currentUser!.id}`, '1');
                  setShowFirstTimeRoleModal(false);
                }}
                className="flex-1 py-3 rounded-xl font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
              >
                No, soy paciente
              </button>
              <button
                onClick={async () => {
                  localStorage.setItem(`role_prompt_shown_${currentUser!.id}`, '1');
                  await handleSetRole('PSYCHOLOGIST');
                }}
                className="flex-1 py-3 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
              >
                Sí, soy psicólogo/a
              </button>
            </div>
          </div>
        </div>
      )}
      {showRolePrompt && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-bold text-slate-800">Elige tu perfil</h2>
            <p className="text-sm text-slate-500 mt-1">Necesitamos saber cómo usarás mainds.</p>

            <div className="mt-4 grid gap-3">
              <button
                onClick={() => setPendingRole('PATIENT')}
                className={`w-full text-left p-4 rounded-xl border transition ${pendingRole === 'PATIENT' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
              >
                <div className="font-semibold text-slate-800">Soy cliente</div>
                <div className="text-xs text-slate-500">Quiero escribir mi diario y seguir mis metas.</div>
              </button>
              <button
                onClick={() => setPendingRole('PSYCHOLOGIST')}
                className={`w-full text-left p-4 rounded-xl border transition ${pendingRole === 'PSYCHOLOGIST' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
              >
                <div className="font-semibold text-slate-800">Soy psicólogo/a</div>
                <div className="text-xs text-slate-500">Quiero gestionar pacientes y ver su progreso.</div>
              </button>
            </div>

            <button
              onClick={handleConfirmRole}
              disabled={!pendingRole}
              className={`mt-4 w-full py-3 rounded-xl font-medium ${pendingRole ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
            >
              Continuar
            </button>
          </div>
        </div>
      )}
      {isProcessing && (
        <div className="fixed inset-0 bg-white/80 z-[60] flex flex-col items-center justify-center backdrop-blur-sm">
           <div className="w-24 h-24 relative flex items-center justify-center mb-4">
              <MaindsLogo className="w-24 h-24 text-indigo-600 animate-pulse" />
              <div className="absolute inset-0 border-4 border-indigo-100 rounded-full animate-ping opacity-20"></div>
           </div>
           <h2 className="text-xl font-semibold text-indigo-900">Procesando...</h2>
        </div>
      )}

      <div className="flex h-screen overflow-hidden bg-slate-50">
        {/* Mobile Toggle Button - Draggable */}
        {!sidebarOpen && (
          <button
            onTouchStart={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              setDragOffset({
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
              });
              setIsDragging(true);
            }}
            onTouchMove={(e) => {
              if (!isDragging) return;
              e.preventDefault();
              const touch = e.touches[0];
              const newTop = touch.clientY - dragOffset.y;
              const newLeft = touch.clientX - dragOffset.x;
              
              // Keep within bounds
              const maxTop = window.innerHeight - 48;
              const maxLeft = window.innerWidth - 48;
              
              setMenuButtonPos({
                top: Math.max(16, Math.min(newTop, maxTop)),
                left: Math.max(16, Math.min(newLeft, maxLeft)),
                right: undefined
              });
            }}
            onTouchEnd={() => {
              if (isDragging) {
                setIsDragging(false);
              } else {
                setSidebarOpen(true);
              }
            }}
            onClick={(e) => {
              if (!isDragging) {
                setSidebarOpen(true);
              }
            }}
            style={{
              top: `${menuButtonPos.top}px`,
              right: menuButtonPos.right !== undefined ? `${menuButtonPos.right}px` : undefined,
              left: menuButtonPos.left !== undefined ? `${menuButtonPos.left}px` : undefined,
              touchAction: 'none',
              cursor: isDragging ? 'grabbing' : 'grab',
              transition: isDragging ? 'none' : 'all 0.3s'
            }}
            className="md:hidden fixed z-50 w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-full shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-blue-700 flex items-center justify-center transition-all"
            aria-label="Abrir menú"
          >
            <MaindsLogo className="w-10 h-10 text-white" />
          </button>
        )}

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/20 z-30 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar tipo Notion */}
        <aside className={`
          fixed md:sticky top-0 left-0 h-screen bg-white border-r border-slate-200 z-40
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          flex flex-col overflow-hidden
          w-64
        `}>
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-lg flex items-center justify-center">
                  <MaindsLogo className="w-9 h-9 text-white" />
                </div>
                <span className="font-mainds text-xl font-bold text-slate-900">mainds</span>
              </div>
              {/* Close button for mobile - inside the menu */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            <button
              onClick={() => { setActiveTab('calendar'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'calendar'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Smile size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Historia</span>
            </button>

            <button
              onClick={() => { setActiveTab('insights'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'insights'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Resumen</span>
            </button>

            <button
              onClick={() => { setActiveTab('appointments'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'appointments'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <CalendarIcon size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Citas</span>
            </button>

            <button
              onClick={() => { setActiveTab('billing'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'billing'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FileText size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Facturación</span>
            </button>

            <button
              onClick={() => { setActiveTab('documents'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'documents'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <BookOpen size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Consentimientos</span>
            </button>

            <button
              onClick={() => { setActiveTab('profile'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium relative ${
                activeTab === 'profile'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <UserIcon size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline flex-1 text-left`}>Mi Perfil</span>
              {isProfileIncomplete && (
                <AlertCircle size={18} className="text-amber-500 animate-pulse" title="Perfil incompleto" />
              )}
            </button>
          </nav>

          <div className={`${sidebarOpen ? 'block' : 'hidden'} md:block p-3 border-t border-slate-200 space-y-2`}>
            {/* Admin tab - solo para superadmins */}
            {SUPERADMIN_EMAILS_FRONTEND.includes(currentUser?.email?.toLowerCase() || '') && (
              <button
                onClick={() => { setPsychViewMode('ADMIN'); if (window.innerWidth < 768) setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium mb-2 ${
                  false
                    ? 'bg-red-50 text-red-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Shield size={18} />
                <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Superadmin</span>
              </button>
            )}
            
            <button
              onClick={handleOpenSettings}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-indigo-700 font-semibold text-sm">
                    {currentUser?.name?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-slate-900 truncate">{currentUser?.name}</p>
                <p className="text-xs text-slate-500 truncate">{!isTempEmail(currentUser?.email) ? currentUser?.email : ''}</p>
              </div>
            </button>

            {/* Patient AI subscription card */}
            {patientSubscriptionInfo && (() => {
              const sub = patientSubscriptionInfo;
              if (sub.is_master) return (
                <div className="rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 text-white p-3 text-xs">
                  <p className="font-semibold">✅ Acceso completo</p>
                  <p className="text-white/80 mt-0.5">Llamadas con IA ilimitadas.</p>
                </div>
              );
              if (sub.is_subscribed) return (
                <div className="rounded-xl bg-gradient-to-br from-green-600 to-emerald-600 text-white p-3 text-xs">
                  <p className="font-semibold">✅ Plan Personal activo</p>
                  <p className="text-white/80 mt-0.5">Llamadas con IA ilimitadas.</p>
                </div>
              );
              if (sub.trial_active) return (
                <button onClick={() => setShowPatientUpgradeModal(true)} className="w-full text-left rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-3 text-xs hover:opacity-90 transition-opacity">
                  <p className="font-semibold">🎙️ Suscríbete a Personal</p>
                  <p className="text-white/80 mt-0.5">Llamadas ilimitadas con IA · 4,99€/mes</p>
                  {sub.trial_days_left > 0 && <p className="text-white/70 mt-1">{sub.trial_days_left} días de prueba restantes</p>}
                </button>
              );
              return (
                <button onClick={() => setShowPatientUpgradeModal(true)} className="w-full text-left rounded-xl bg-gradient-to-br from-red-600 to-rose-600 text-white p-3 text-xs hover:opacity-90 transition-opacity">
                  <p className="font-semibold">⛔ Sin acceso a IA</p>
                  <p className="text-white/80 mt-0.5">Suscríbete para hablar con la IA · 4,99€/mes</p>
                </button>
              );
            })()}
            
            {/* Botón de Cerrar Sesión - Visible directamente en el sidebar */}
            <button
              onClick={() => {
                if (window.confirm('¿Cerrar sesión?')) {
                  handleLogout();
                }
              }}
              className="w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left flex items-center gap-2"
            >
              <LogOut size={16} />
              <span>Cerrar Sesión</span>
            </button>
            
            {currentUser?.is_psychologist === true && (
              <button
                onClick={() => {
                  // Doble verificación antes de cambiar a vista profesional
                  if (currentUser?.is_psychologist === true) {
                    setPsychViewMode('DASHBOARD');
                  }
                }}
                className="w-full px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors text-left flex items-center gap-2 border border-purple-100"
              >
                <Briefcase size={16} />
                <span>Panel Pro</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full px-4 md:px-8 py-4 md:py-8 space-y-6">
            {/* Mobile Header - Now visible with page title */}
            <header className="md:hidden mb-6">
              <div className="flex items-center gap-3 mb-2">
                {activeTab === 'insights' && <LayoutDashboard className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'calendar' && <Smile className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'appointments' && <CalendarIcon className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'sessions' && <Stethoscope className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'billing' && <FileText className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'connections' && <Link2 className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'profile' && <UserIcon className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'admin' && <Shield className="w-6 h-6 text-red-600" />}
                {activeTab === 'documents' && <BookOpen className="w-6 h-6 text-indigo-600" />}
                <h1 className="text-2xl font-bold text-slate-900">
                  {activeTab === 'insights' && 'Resumen'}
                  {activeTab === 'calendar' && 'Historia'}
                  {activeTab === 'appointments' && 'Citas'}
                  {activeTab === 'sessions' && 'Sesiones'}
                  {activeTab === 'billing' && 'Facturación'}
                  {activeTab === 'profile' && 'Mi Perfil'}
                  {activeTab === 'admin' && 'Administración'}
                  {activeTab === 'documents' && 'Consentimientos'}
                </h1>
              </div>
              <p className="text-sm text-slate-500">
                {activeTab === 'insights' && 'Vista general de tu progreso'}
                {activeTab === 'calendar' && 'Visualiza tus entradas y actividades'}
                {activeTab === 'appointments' && 'Gestiona tus citas con el psicólogo'}
                {activeTab === 'sessions' && 'Sesiones clínicas con tu psicólogo'}
                {activeTab === 'billing' && 'Consulta y descarga tus facturas'}
                {activeTab === 'profile' && 'Información personal y preferencias'}
                {activeTab === 'admin' && 'Panel de administración del sistema'}
                {activeTab === 'documents' && 'Consentimientos enviados por tu psicólogo'}
              </p>
            </header>

            {/* Desktop Header */}
            <header className="hidden md:flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  {activeTab === 'insights' && 'Resumen'}
                  {activeTab === 'calendar' && 'Mi Historia'}
                  {activeTab === 'appointments' && 'Mis Citas'}
                  {activeTab === 'sessions' && 'Sesiones Clínicas'}
                  {activeTab === 'billing' && 'Facturación'}
                  {activeTab === 'profile' && 'Mi Perfil'}
                  {activeTab === 'admin' && 'Administración del Sistema'}
                  {activeTab === 'documents' && 'Mis Consentimientos'}
                </h1>
                <p className="text-slate-500 mt-1">
                  {activeTab === 'insights' && 'Vista general de tu progreso'}
                  {activeTab === 'calendar' && 'Visualiza tus entradas y actividades del día a día'}
                  {activeTab === 'appointments' && 'Gestiona y reserva citas con tu psicólogo'}
                  {activeTab === 'sessions' && 'Sesiones clínicas con tu psicólogo'}
                  {activeTab === 'billing' && 'Consulta y descarga tus facturas'}
                  {activeTab === 'profile' && 'Información personal y configuración de tu cuenta'}
                  {activeTab === 'admin' && 'Gestión de usuarios del sistema'}
                  {activeTab === 'documents' && 'Lee y firma los consentimientos enviados por tu psicólogo'}
                </p>
              </div>
              {activeTab === 'calendar' && (
                <button
                  onClick={() => handleStartSession()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/30"
                >
                  <Mic size={20} />
                  Hablar con IA
                </button>
              )}
            </header>

            {/* Mobile Action Button - Circular Floating Button */}
            <button
              onClick={() => handleStartSession()}
              className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl hover:shadow-indigo-500/50 transition-all flex items-center justify-center"
              aria-label="Grabar entrada"
            >
              <Mic size={24} />
            </button>

            {activeTab === 'insights' && assignedGoals.length > 0 && (
              <div className="bg-purple-50 rounded-2xl border border-purple-100">
                <div className="px-4 py-3 flex items-center gap-2 border-b border-purple-100/50">
                  <CheckSquare className="text-purple-600" size={18} />
                  <h3 className="font-bold text-purple-800 text-sm uppercase tracking-wide">Plan</h3>
                </div>
                <Suspense fallback={null}>
                  <GoalsPanel 
                    title="" goals={assignedGoals} onAddGoal={() => {}} onToggleGoal={handleToggleGoal} onDeleteGoal={() => {}} 
                    readOnly={true} showAdd={false}
                  />
                </Suspense>
              </div>
            )}

            {activeTab === 'insights' && (
              <div className="space-y-4 md:space-y-6 animate-in fade-in">
                {/* Stats Cards - Solo 2 cards principales */}
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl md:rounded-3xl border border-indigo-100 p-4 md:p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                        <FileText className="w-4 h-4 md:w-5 md:h-5 text-indigo-600" />
                      </div>
                      <div className="text-xs md:text-sm font-semibold text-indigo-900">Entradas</div>
                    </div>
                    <div className="text-3xl md:text-4xl font-bold text-indigo-900">{totalEntriesCount}</div>
                  </div>
                </div>

                {/* CTA Principal */}
                {!hasTodayEntry && (
                  <button
                    onClick={() => handleStartSession()}
                    className="w-full py-4 md:py-5 rounded-2xl md:rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-base md:text-lg shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Mic className="w-5 h-5 md:w-6 md:h-6" />
                    ¿Qué tal estás hoy?
                  </button>
                )}

                {/* Goals Panel */}
                <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 md:px-6 py-3 md:py-4 border-b border-slate-200">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm md:text-base">
                      <Target className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
                      Mis Objetivos
                    </h3>
                  </div>
                  <div className="p-4 md:p-6">
                    <Suspense fallback={null}>
                      <GoalsPanel goals={personalGoals} onAddGoal={handleAddGoal} onToggleGoal={handleToggleGoal} onDeleteGoal={handleDeleteGoal} />
                    </Suspense>
                  </div>
                </div>

                {/* Última Sesión */}
                {latestSessionEntry && (
                  <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm md:text-base">
                        <Stethoscope className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
                        Última sesión
                      </h3>
                      <span className="text-xs font-medium text-slate-600">
                        {new Date(latestSessionEntry.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="p-4 md:p-6 space-y-3">
                      <p className="text-sm md:text-base text-slate-700 leading-relaxed line-clamp-3">
                        {latestSessionEntry.summary}
                      </p>
                      <button
                        onClick={() => { setSelectedDate(latestSessionEntry.date); setSelectedEntryId(latestSessionEntry.id); setSelectedEntryMode('single'); }}
                        className="text-xs md:text-sm font-semibold text-purple-700 bg-purple-50 px-4 py-2 rounded-full hover:bg-purple-100 transition-colors"
                      >
                        Ver detalle →
                      </button>
                    </div>
                  </div>
                )}

                {/* Insights Panel */}
                <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-4 md:px-6 py-3 md:py-4 border-b border-slate-200">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm md:text-base">
                      <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-indigo-600" />
                      Tu progreso
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">Últimos 14 días</p>
                  </div>
                  <div className="p-4 md:p-6">
                    <Suspense fallback={null}>
                      <InsightsPanel entries={entries} />
                    </Suspense>
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'sessions' && (
              <div className="animate-in fade-in">
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Sesiones clínicas</h3>
                  {sessionEntries.length === 0 ? (
                    <p className="text-sm text-slate-500">Aún no hay sesiones clínicas.</p>
                  ) : (
                    <div className="space-y-3 max-h-[520px] overflow-y-auto">
                      {sessionEntries.map(entry => {
                        const timeLabel = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        const sessionFeedbackText = getFeedbackText(entry);
                        const summaryText = (entry.summary || '').trim();
                        const emotions = Array.isArray(entry.emotions) ? entry.emotions : [];
                        const hasTranscript = Boolean(entry.transcript && entry.transcript.trim().length > 0);
                        const hasFeedback = sessionFeedbackText.trim().length > 0;
                        const hasAdvice = Boolean(entry.advice && entry.advice.trim().length > 0);
                        const isUnread = isFeedbackUnread(entry);
                        return (
                          <div key={entry.id} className="p-4 rounded-2xl border border-purple-100 bg-purple-50/40">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                                    Sesión clínica
                                  </span>
                                  {isUnread && (
                                    <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                                      No leído
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500">{entry.date}{timeLabel ? ` • ${timeLabel}` : ''}</div>
                              </div>
                              <button
                                onClick={() => {
                                  if (isFeedbackUnread(entry)) {
                                    markFeedbackAsRead([entry]);
                                  }
                                  setSelectedDate(entry.date);
                                  setSelectedEntryId(entry.id);
                                  setSelectedEntryMode('single');
                                }}
                                className="text-[11px] font-semibold text-purple-700 bg-white border border-purple-100 px-2 py-0.5 rounded-full hover:bg-purple-50"
                              >
                                Ver detalle
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mb-3">
                              {hasTranscript && (
                                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                  Transcript
                                </span>
                              )}
                              {emotions.slice(0, 6).map((em, idx) => (
                                <span key={`${em}-${idx}`} className="text-[10px] bg-white text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-semibold">
                                  {em}
                                </span>
                              ))}
                            </div>
                            {summaryText && (
                              <div className="bg-white/80 border border-slate-100 rounded-xl p-3 mb-3">
                                <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1">Resumen de la sesión</h4>
                                <p className="text-sm text-slate-800 leading-relaxed">{summaryText}</p>
                              </div>
                            )}
                            {hasFeedback && (
                              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-3">
                                <h4 className="text-[10px] font-bold uppercase text-indigo-700 mb-1">Feedback del psicólogo</h4>
                                <p className="text-sm text-slate-800 leading-relaxed">{sessionFeedbackText}</p>
                              </div>
                            )}
                            {hasAdvice && (
                              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                                <h4 className="text-[10px] font-bold uppercase text-purple-700 mb-1">Meta terapéutica</h4>
                                <p className="text-sm text-slate-800 leading-relaxed">{entry.advice}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Vista de Citas */}
            {activeTab === 'appointments' && (
              <div className="animate-in fade-in">
                <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}>
                  <PatientSessions />
                </Suspense>
              </div>
            )}

            {/* Vista de Calendario */}
            {activeTab === 'calendar' && (
              <div className="animate-in fade-in">
                <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}>
                  <CalendarView
                    entries={entries}
                    onSelectDate={(date) => { setSelectedDate(date); setSelectedEntryMode('day'); }}
                    currentUserId={currentUser?.id}
                  />
                </Suspense>
              </div>
            )}

            {/* Vista de Facturación */}
            {activeTab === 'billing' && (
              <div className="animate-in fade-in">
                <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}>
                  <PatientBillingPanel />
                </Suspense>
              </div>
            )}

            {activeTab === 'profile' && currentUser && (
              <div className="animate-in fade-in">
                <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}>
                  <PatientProfilePanel userId={currentUser.id} />
                </Suspense>
              </div>
            )}

            {activeTab === 'documents' && currentUser && (
              <div className="animate-in fade-in">
                <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>}>
                  <PatientDocumentsPanel patientId={currentUser.id} />
                </Suspense>
              </div>
            )}
          </div>
        </main>
      </div>

      {viewState === ViewState.VOICE_SESSION && <Suspense fallback={null}><VoiceSession key={Date.now()} onSessionEnd={handleSessionEnd} onCancel={() => setViewState(ViewState.CALENDAR)} settings={settings} /></Suspense>}

      {/* Patient upgrade modal */}
      {showPatientUpgradeModal && currentUser && (() => {
        const trialAvailable = patientSubscriptionInfo?.trial_active === true;
        return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white text-center">
              <div className="text-4xl mb-2">🎙️</div>
              <h2 className="text-xl font-bold">Plan Personal</h2>
              <p className="text-white/80 text-sm mt-1">Llamadas ilimitadas con la IA para tu bienestar diario</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Llamadas ilimitadas con IA</div>
                <div className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Diario de voz con análisis automático</div>
                <div className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> Seguimiento de tu progreso</div>
                {trialAvailable && (
                  <div className="flex items-center gap-2"><span className="text-green-500 font-bold">✓</span> {patientSubscriptionInfo!.trial_days_left} días de prueba gratis restantes</div>
                )}
              </div>
              <div className="bg-indigo-50 rounded-xl p-3 text-center">
                <span className="text-2xl font-bold text-indigo-700">4,99€</span>
                <span className="text-slate-500 text-sm">/mes</span>
                {trialAvailable && <p className="text-xs text-slate-400 mt-0.5">Los primeros {patientSubscriptionInfo!.trial_days_left} días son gratis</p>}
              </div>
              <button
                onClick={async () => {
                  try {
                    const resp = await AuthService.createCheckoutSession({ subscription_type: 'patient', plan_id: 'patient_premium' });
                    if (resp?.url) {
                      window.location.href = resp.url;
                    }
                  } catch (err: any) {
                    alert(err?.message || 'Error iniciando el pago');
                  }
                  setShowPatientUpgradeModal(false);
                }}
                className="w-full py-3 rounded-xl font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                {trialAvailable ? `Empezar prueba — ${patientSubscriptionInfo!.trial_days_left} días gratis` : 'Suscribirse — 4,99€/mes'}
              </button>
              <button
                onClick={() => setShowPatientUpgradeModal(false)}
                className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
        );
      })()}
      {selectedDate && (
        <Suspense fallback={null}>
          <EntryModal 
            entries={entriesForModal} 
            dateStr={selectedDate} 
            onClose={() => { setSelectedDate(null); setSelectedEntryId(null); setSelectedEntryMode('day'); }}
            onStartSession={(dateStr) => handleStartSession(dateStr)} 
            onDeleteEntry={handleDeleteEntry} 
            onUpdateEntry={handleUpdateEntry}
            currentUserId={currentUser?.id}
          />
        </Suspense>
      )}
      {weeklyReport && <Suspense fallback={null}><WeeklyReportModal report={weeklyReport} onClose={() => setWeeklyReport(null)} /></Suspense>}
      {showSettings && currentUser && <SettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => { setShowSettings(false); if(currentUser) checkInvitations(currentUser.email); }} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />}
    </div>
  );
};

export default App;