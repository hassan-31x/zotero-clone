export type Identity = { _id: string; displayName: string; createdAt: string };
export type Library = {
  _id: string;
  name: string;
  ownerId?: string;
  teamId?: string;
  role?: "owner" | "editor" | "viewer";
};
export type Paper = {
  _id: string;
  libraryId: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  abstract?: string;
  doi?: string;
  arxivId?: string;
  url?: string;
  citationKey?: string;
  tags: string[];
  collectionIds: string[];
  status: string;
  favorite: boolean;
  archived?: boolean;
  aiDisabled?: boolean;
  deleted?: boolean;
  assignedTo?: string | null;
  filePath?: string;
  fileHash?: string;
  fileSize?: number;
  pageCount?: number;
  jobState: string;
  jobError?: string | null;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  readingPage?: number;
  priority?: string;
  metadataEdited?: boolean;
  attachmentIds?: string[];
};
export type PageText = {
  _id: string;
  paperId: string;
  pageIndex: number;
  text: string;
  offset: number;
};
export type Rect = { x: number; y: number; width: number; height: number };
export type Annotation = {
  _id: string;
  paperId: string;
  identityId: string;
  author: string;
  pageIndex: number;
  kind: "highlight" | "underline" | "comment" | "rectangle" | "bookmark";
  quote: string;
  comment: string;
  color: string;
  rects: Rect[];
  shared: boolean;
  createdAt: string;
  deleted?: boolean;
};
export type Note = {
  _id: string;
  paperId: string;
  identityId: string;
  author: string;
  title: string;
  content: string;
  shared: boolean;
  version: number;
  updatedAt: string;
};
export type Goal = {
  _id: string;
  paperId: string;
  identityId: string;
  title: string;
  state: string;
  order: number;
};
export type Source = { page: number; text: string; paperId?: string };
export type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};
export type Settings = {
  aiEnabled: boolean;
  chatModel: string;
  fastModel: string;
  temperature: number;
  theme: string;
  interests: string[];
  citationStyle: string;
  fontSize: number;
  maxOutputTokens: number;
  streaming: boolean;
  spendLimit: number;
};
export const defaultSettings: Settings = {
  aiEnabled: true,
  chatModel: "",
  fastModel: "",
  temperature: 0.2,
  theme: "light",
  interests: [],
  citationStyle: "APA",
  fontSize: 14,
  maxOutputTokens: 1800,
  streaming: true,
  spendLimit: 5,
};
