export type CommentStatus = "pending" | "approved" | "rejected" | "spam";

export interface CommentRow {
  id: string;
  page_id: string;
  page_title: string | null;
  parent_id: string | null;
  author_name: string;
  author_email: string;
  author_email_hash: string;
  author_url: string | null;
  content: string;
  status: CommentStatus;
  level_label: string;
  level_score: number;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}

export interface PublicComment {
  id: string;
  pageId: string;
  pageTitle: string | null;
  parentId: string | null;
  authorName: string;
  authorUrl: string | null;
  content: string;
  status: CommentStatus;
  level: {
    label: string;
    score: number;
  };
  createdAt: string;
  approvedAt: string | null;
}

export interface NewCommentInput {
  pageId: string;
  pageTitle?: string;
  parentId?: string;
  authorName: string;
  authorEmail: string;
  authorUrl?: string;
  content: string;
  website?: string;
}

export interface ModerationResult {
  status: CommentStatus;
  reason: string;
}

export type ExternalCommentSource = "wordpress" | "typecho" | "twikoo" | "waline" | "generic";

export interface ExternalCommentInput {
  source: ExternalCommentSource;
  externalId: string;
  pageId: string;
  pageTitle?: string;
  parentExternalId?: string;
  authorName: string;
  authorEmail?: string;
  authorUrl?: string;
  content: string;
  status: CommentStatus;
  createdAt: string;
  userAgent?: string;
}
