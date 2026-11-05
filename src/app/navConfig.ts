/**
 * Workspace navigation model.
 *
 * One list drives the sidebar, the collapsed rail, the mobile drawer, the
 * bottom bar, the command palette and the route titles — so a destination can
 * never appear in one place and be missing in another.
 *
 * `status` is the honesty contract: a module that is not built yet is marked
 * `planned` with the phase that enables it, and its route renders an explicit
 * "not available yet" surface. Nothing is presented as working before it is.
 */
import {
  BookOpen,
  CheckSquare,
  Code2,
  Compass,
  FileText,
  FlaskConical,
  FolderKanban,
  House,
  MessageSquare,
  PenLine,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { RouteName } from './router';

export type ModulePhase = '3B' | '3C' | '3D' | '4A' | '4B' | '4C' | '4D' | '4E' | '4F';
export type ModuleStatus = 'live' | 'planned';

export interface WorkspaceNavItem {
  id: string;
  route: RouteName;
  href: string;
  /** i18n key for the visible label. */
  labelKey: string;
  icon: LucideIcon;
  status: ModuleStatus;
  phase?: ModulePhase;
  /** i18n keys used by the planned-module surface. */
  descriptionKey?: string;
  bulletKeys?: [string, string];
}

/** Primary workspace destinations, in product order. */
export const WORKSPACE_NAV: WorkspaceNavItem[] = [
  { id: 'home', route: 'home', href: '/', labelKey: 'navHome', icon: House, status: 'live' },
  {
    id: 'chat',
    route: 'chat',
    href: '/chat',
    labelKey: 'wsMenuChat',
    icon: MessageSquare,
    status: 'planned',
    phase: '3D',
    descriptionKey: 'wsAreaChatDesc',
    bulletKeys: ['wsAreaChatB1', 'wsAreaChatB2'],
  },
  {
    id: 'projects',
    route: 'projects',
    href: '/projects',
    labelKey: 'wsMenuProjects',
    icon: FolderKanban,
    status: 'planned',
    phase: '4B',
    descriptionKey: 'wsAreaProjectsDesc',
    bulletKeys: ['wsAreaProjectsB1', 'wsAreaProjectsB2'],
  },
  {
    id: 'documents',
    route: 'documents',
    href: '/documents',
    labelKey: 'wsMenuDocuments',
    icon: FileText,
    status: 'planned',
    phase: '4C',
    descriptionKey: 'wsAreaDocumentsDesc',
    bulletKeys: ['wsAreaDocumentsB1', 'wsAreaDocumentsB2'],
  },
  {
    id: 'writing',
    route: 'writing',
    href: '/writing',
    labelKey: 'wsMenuWriting',
    icon: PenLine,
    status: 'planned',
    phase: '4C',
    descriptionKey: 'wsAreaWritingDesc',
    bulletKeys: ['wsAreaWritingB1', 'wsAreaWritingB2'],
  },
  {
    id: 'research',
    route: 'research',
    href: '/research',
    labelKey: 'wsMenuResearch',
    icon: FlaskConical,
    status: 'planned',
    phase: '4D',
    descriptionKey: 'wsAreaResearchDesc',
    bulletKeys: ['wsAreaResearchB1', 'wsAreaResearchB2'],
  },
  {
    id: 'code',
    route: 'code',
    href: '/code',
    labelKey: 'wsMenuCode',
    icon: Code2,
    status: 'planned',
    phase: '4D',
    descriptionKey: 'wsAreaCodeDesc',
    bulletKeys: ['wsAreaCodeB1', 'wsAreaCodeB2'],
  },
  {
    id: 'knowledge',
    route: 'knowledge',
    href: '/knowledge',
    labelKey: 'wsMenuKnowledge',
    icon: BookOpen,
    status: 'planned',
    phase: '4E',
    descriptionKey: 'wsAreaKnowledgeDesc',
    bulletKeys: ['wsAreaKnowledgeB1', 'wsAreaKnowledgeB2'],
  },
  {
    id: 'tasks',
    route: 'tasks',
    href: '/tasks',
    labelKey: 'wsMenuTasks',
    icon: CheckSquare,
    status: 'planned',
    phase: '4F',
    descriptionKey: 'wsAreaTasksDesc',
    bulletKeys: ['wsAreaTasksB1', 'wsAreaTasksB2'],
  },
];

/** Secondary surface: the preserved NASA science suite (D1). */
export const EXPLORE_NAV: WorkspaceNavItem = {
  id: 'explore',
  route: 'explore',
  href: '/explore',
  labelKey: 'wsExplore',
  icon: Compass,
  status: 'live',
};

/** Account-level destinations, pinned to the sidebar footer. */
export const ACCOUNT_NAV: WorkspaceNavItem[] = [
  {
    id: 'settings',
    route: 'settings',
    href: '/settings',
    labelKey: 'wsSettings',
    icon: Settings,
    status: 'planned',
    phase: '3C',
    descriptionKey: 'wsAreaSettingsDesc',
    bulletKeys: ['wsAreaSettingsB1', 'wsAreaSettingsB2'],
  },
  {
    id: 'profile',
    route: 'profile',
    href: '/profile',
    labelKey: 'wsProfile',
    icon: UserRound,
    status: 'live',
  },
];

/** The four-item mobile bar plus the drawer trigger. */
export const MOBILE_NAV_IDS = ['home', 'chat', 'explore', 'tasks'] as const;

export function findNavItem(id: string): WorkspaceNavItem | undefined {
  return [...WORKSPACE_NAV, EXPLORE_NAV, ...ACCOUNT_NAV].find((item) => item.id === id);
}

export function navItemForRoute(route: RouteName): WorkspaceNavItem | undefined {
  return [...WORKSPACE_NAV, EXPLORE_NAV, ...ACCOUNT_NAV].find((item) => item.route === route);
}

/** Route → label key, used for the top bar breadcrumb and document titles. */
export const ROUTE_LABEL_KEYS: Partial<Record<RouteName, string>> = {
  home: 'navHome',
  chat: 'wsMenuChat',
  projects: 'wsMenuProjects',
  documents: 'wsMenuDocuments',
  writing: 'wsMenuWriting',
  research: 'wsMenuResearch',
  code: 'wsMenuCode',
  knowledge: 'wsMenuKnowledge',
  tasks: 'wsMenuTasks',
  settings: 'wsSettings',
  profile: 'wsProfile',
  explore: 'wsExplore',
};
