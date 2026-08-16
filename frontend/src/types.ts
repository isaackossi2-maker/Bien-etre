export type Role = "ADMIN" | "USER";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar?: string | null;
  createdAt?: string;
}

export interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
}

export type QuestionType = "SINGLE" | "MULTIPLE";

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  order: number;
  examId: string;
  answers: Answer[];
  exam?: { id: string; title: string };
}

export interface Exam {
  id: string;
  title: string;
  description?: string | null;
  isActive: boolean;
  duration?: number | null;
  maxAttempts?: number | null;
  attemptsUsed?: number;
  createdAt: string;
  _count?: { questions: number };
  questions?: Question[];
}

export interface Meditation {
  id: string;
  title: string;
  description?: string | null;
  content?: string | null;
  duration?: number | null;
  createdAt: string;
  _count?: { views: number };
}

export interface MeditationView {
  id: string;
  viewedAt: string;
  user: { id: string; name: string; email: string };
}

export type MessageType = "TEXT" | "AUDIO" | "FILE";

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  type: MessageType;
  content: string | null;
  audioData?: string | null;
  audioDuration?: number | null;
  fileData?: string | null;
  fileName?: string | null;
  fileMimeType?: string | null;
  createdAt: string;
  sender: { id: string; name: string; role: Role; avatar?: string | null };
}

export interface MessageContact {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface DirectoryUser {
  id: string;
  name: string;
  role: Role;
  avatar?: string | null;
}

export interface GroupSummary {
  id: string;
  name: string;
  avatar?: string | null;
  memberCount: number;
  members: { id: string; name: string; avatar?: string | null }[];
  lastMessageAt: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  audioData?: string | null;
  audioDuration?: number | null;
  fileData?: string | null;
  fileName?: string | null;
  fileMimeType?: string | null;
  createdAt: string;
  sender: { id: string; name: string; role: Role; avatar?: string | null };
}

export interface PostComment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; role: Role; avatar?: string | null };
}

export interface Post {
  id: string;
  content: string;
  background?: string | null;
  createdAt: string;
  author: { id: string; name: string; role: Role; avatar?: string | null };
  reactionSummary: Record<string, number>;
  reactionCount: number;
  myReaction: string | null;
  comments: PostComment[];
  recipients: { id: string; name: string }[];
}

export interface LogEntry {
  id: string;
  action: string;
  message?: string | null;
  createdAt: string;
  user?: { name: string; email: string; avatar?: string | null } | null;
}

export interface ExamResult {
  id: string;
  examId: string;
  score: number;
  total: number;
  comment?: string | null;
  createdAt: string;
  exam?: { title: string };
  user?: { name: string; email: string };
  userAnswers?: {
    id: string;
    question: { text: string };
    answer: { text: string; isCorrect: boolean };
  }[];
}

export interface GradeAnswer {
  id: string;
  text: string;
  isCorrect: boolean;
  selected: boolean;
}

export interface GradeQuestion {
  id: string;
  text: string;
  type: QuestionType;
  answers: GradeAnswer[];
  isCorrect: boolean;
}

export interface ExamResultDetail {
  id: string;
  score: number;
  total: number;
  comment?: string | null;
  createdAt: string;
  exam: { id: string; title: string };
  user: { id: string; name: string; email: string };
  questions: GradeQuestion[];
}

export interface DashboardStats {
  counts: {
    users: number;
    exams: number;
    meditations: number;
    questions: number;
    examResults: number;
  };
  recentLogs: LogEntry[];
}
