import {
  Sparkles, Zap, Building2, Megaphone, Info,
  type LucideIcon,
} from "lucide-react";

export interface Notif {
  id: string;
  icon: LucideIcon;
  color: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  timeAr: string;
  timeEn: string;
  category: "info" | "tip" | "system" | "feature";
}

export const NOTIFICATIONS: Notif[] = [
  {
    id: "n1",
    icon: Sparkles,
    color: "text-primary",
    titleAr: "مرحباً بك في المنصة",
    titleEn: "Welcome to the platform",
    bodyAr: "ابدأ بإنشاء علامتك التجارية الأولى وتجربة قوة الذكاء الاصطناعي في بناء الهوية البصرية الكاملة.",
    bodyEn: "Start by creating your first brand and experience the power of AI in building a complete visual identity.",
    timeAr: "الآن",
    timeEn: "Now",
    category: "info",
  },
  {
    id: "n2",
    icon: Zap,
    color: "text-amber-500",
    titleAr: "نصيحة: محرر العقد المرئي",
    titleEn: "Tip: Visual Nodes Editor",
    bodyAr: "يمكنك في محرر العقد دمج صور مرجعية مع النصوص لتوليد صور احترافية بدقة عالية باستخدام الذكاء الاصطناعي.",
    bodyEn: "In the Nodes editor, combine reference images with prompts to generate professional high-quality AI images.",
    timeAr: "منذ ساعة",
    timeEn: "1 hour ago",
    category: "tip",
  },
  {
    id: "n3",
    icon: Building2,
    color: "text-cyan-500",
    titleAr: "جاهز لبناء هويتك البصرية؟",
    titleEn: "Ready to build your visual identity?",
    bodyAr: "أضف شعارك وألوانك الأساسية وسيُنشئ الذكاء الاصطناعي هويتك البصرية الكاملة مع دليل الأسلوب.",
    bodyEn: "Add your logo and primary colors and AI will build your complete visual identity with a style guide.",
    timeAr: "منذ ساعتين",
    timeEn: "2 hours ago",
    category: "feature",
  },
  {
    id: "n4",
    icon: Megaphone,
    color: "text-violet-500",
    titleAr: "ميزة: الحملات التسويقية متعددة الأيام",
    titleEn: "Feature: Multi-day Marketing Campaigns",
    bodyAr: "جرّب توليد حملة تسويقية متعددة الأيام لأي علامة تجارية تشمل محتوى وسائل التواصل الاجتماعي كاملاً.",
    bodyEn: "Try generating a multi-day marketing campaign for any brand including complete social media content.",
    timeAr: "منذ 5 ساعات",
    timeEn: "5 hours ago",
    category: "feature",
  },
  {
    id: "n5",
    icon: Info,
    color: "text-muted-foreground",
    titleAr: "تحديث النظام — ميزات جديدة",
    titleEn: "System Update — New Features",
    bodyAr: "تم تحديث المنصة بميزات جديدة تشمل: محرر العقد المرئي، نظام الهوية البصرية المتقدم، ودعم اللغة العربية الكامل.",
    bodyEn: "The platform has been updated with new features including: Visual Nodes Editor, advanced brand identity system, and full Arabic language support.",
    timeAr: "منذ يوم",
    timeEn: "1 day ago",
    category: "system",
  },
];

export function notifStorageKey(userId: string) {
  return `notifs_read_${userId}`;
}

export function getReadIds(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(notifStorageKey(userId)) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function saveReadIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(notifStorageKey(userId), JSON.stringify([...ids]));
  } catch {}
}
