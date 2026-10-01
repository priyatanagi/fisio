export interface OutlineSection {
  heading: string;
  mustCover: string[];
}

export interface FaqPlanItem {
  question: string;
  answerShape: string;
}

export interface SeoBrief {
  seoMetadata: import('../types/article').SeoMetadata;
  secondaryKeywords: string[];
  outline: OutlineSection[];
  faqPlan: FaqPlanItem[];
  statPlan: string[];
  internalLinkTargets: string[];
  source: 'impower' | 'creator-selfplanned' | 'minimal';
}
