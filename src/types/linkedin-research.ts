interface EducationItem {
  schoolName?: string;
  degreeName?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

interface PostItem {
  text?: string;
  title?: string;
  url?: string;
  totalReactionCount?: number;
  commentsCount?: number;
  postedAt?: string;
  content?: string;
}

interface ArticleItem {
  title?: string;
  url?: string;
  description?: string;
  publishedAt?: string;
  content?: string;
}

interface ReactionItem {
  reactionType?: string;
  postText?: string;
  postUrl?: string;
}

export interface LinkedInResearchResult {
  person: {
    name: string;
    headline: string;
    location: string;
    profileUrl: string;
    profilePicture?: string;
    urn: string;
  };
  education: EducationItem[];
  featuredPosts: PostItem[];
  articles: ArticleItem[];
  reactions: ReactionItem[];
  babelAnalysis: {
    communicationStyle: string;
    topicEntryPoints: string[];
    warnings: string[];
    icebreakers: string[];
    personality: string;
    professionalFocus: string;
  };
  generatedAt: string;
}
