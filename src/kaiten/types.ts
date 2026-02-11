// --- Raw Kaiten API types ---

/** GET /api/latest/cards/{card_id} */
export interface KaitenCard {
  id: number;
  title: string;
  description: string | null;
  state: number;
  board_id: number;
  column_id: number;
  lane_id: number | null;
  owner_id: number | null;
  members: KaitenMember[];
  tags: KaitenTag[];
  created: string;
  updated: string;
}

export interface KaitenMember {
  id: number;
  full_name: string;
}

export interface KaitenTag {
  id: number;
  name: string;
}

/** GET /api/latest/cards/{card_id}/comments -- array element */
export interface KaitenComment {
  id: number;
  text: string;
  author_id: number;
  card_id: number;
  created: string;
  updated: string;
}

// --- Internal types (MCP output) ---

export interface TaskDetails {
  card_id: number;
  title: string;
  description: string | null;
  state: string;
  board_id: number;
  column_id: number;
  lane_id: number | null;
  owner_id: number | null;
  members: { id: number; full_name: string }[];
  tags: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
  comments?: CommentsPage;
}

export interface CommentsPage {
  items: CommentItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface CommentItem {
  id: number;
  author_id: number;
  text: string;
  created_at: string;
  updated_at: string;
}

/** GET /api/latest/cards/{card_id}/time-logs -- array element */
export interface KaitenTimeLog {
  id: number;
  card_id: number;
  user_id: number;
  author_id: number;
  role_id: number | null;
  time_spent: number;
  for_date: string;
  comment: string | null;
  created: string;
  updated: string;
}

export interface TimeLogEntry {
  id: number;
  user_id: number;
  author_id: number;
  time_spent: number;
  for_date: string;
  comment: string | null;
  created_at: string;
}

export interface TimeLogsResponse {
  card_id: number;
  total_minutes: number;
  entries: TimeLogEntry[];
}

export interface TimeLogsByUser {
  card_id: number;
  total_minutes: number;
  by_user: { user_id: number; total_minutes: number; entries: TimeLogEntry[] }[];
}

export interface TimeLogsByDate {
  card_id: number;
  total_minutes: number;
  by_date: { for_date: string; total_minutes: number; entries: TimeLogEntry[] }[];
}

// --- State mapping ---

const STATE_MAP: Record<number, string> = {
  1: 'active',
};

export function mapState(state: number): string {
  return STATE_MAP[state] ?? `unknown_${state}`;
}

// --- Errors ---

export class KaitenApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'KaitenApiError';
  }
}
