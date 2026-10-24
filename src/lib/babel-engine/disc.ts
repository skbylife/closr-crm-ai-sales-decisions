/**
 * BABEL Engine — DISC 人格推断模块
 *
 * 基于 LinkedIn 公开信息（职位、简介、发帖、职业路径）推断 DISC 人格类型，
 * 输出接触策略、风险警告和开场白模板。
 */

// ─── 接口定义 ────────────────────────────────────────────────────────────────

export interface LinkedInProfile {
  name: string;
  headline?: string;          // 职位标题
  summary?: string;           // 个人简介
  currentCompany?: string;    // 当前公司
  jobHistory?: Array<{
    title: string;
    company: string;
    durationMonths: number;
  }>;
  posts?: string[];           // 最近发帖内容（数组）
  connectionsCount?: number;  // 人脉数量
  skills?: string[];
}

export type DISCType = 'D' | 'I' | 'S' | 'C';

export interface DISCResult {
  primary: DISCType;
  secondary?: DISCType;
  confidence: number;          // 0-1
  scores: Record<DISCType, number>;
  evidence: string[];          // 支撑本次判断的具体证据列表
  approachStrategy: string;    // 一段话说明最佳接触策略
  riskWarnings: string[];      // 接触风险点
  optimalChannel: 'email' | 'linkedin_dm' | 'phone' | 'warm_intro';
  openingLineTemplate: string; // 建议的开场白模板
}

// ─── 关键词字典 ───────────────────────────────────────────────────────────────

const DISC_KEYWORDS: Record<DISCType, string[]> = {
  D: [
    '执行', '结果', 'driven', 'p&l', 'growth', 'scale', 'founder',
    'built', 'led', 'achieved', 'exceeded', '3x', '10x', 'revenue',
    'closed', 'won', 'aggressive', 'turnaround', 'disrupt', '增长', '规模',
  ],
  I: [
    'excited', 'passionate', 'team', 'community', 'inspire', 'connect',
    'share', 'believe', 'love', 'amazing', 'thrilled', 'culture',
    '人脉', '分享', '激动', '热情', '关系', '影响力',
  ],
  S: [
    'support', 'collaborate', 'together', 'helping', 'dedicated',
    'committed', 'long-term', 'partnership', 'trust', 'loyalty',
    '协作', '感谢', '团队', '陪伴', '稳定', '持续',
  ],
  C: [
    'analyze', 'data', 'research', 'systematic', 'process', 'metrics',
    'evidence', 'framework', 'methodology', 'proven', '数据', '分析',
    '研究', '系统', '流程', '标准', '精确',
  ],
};

// ─── 辅助：关键词计分 ─────────────────────────────────────────────────────────

function countKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((count, kw) => count + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0);
}

function scoreTextForDisc(text: string): Record<DISCType, number> {
  const scores: Record<DISCType, number> = { D: 0, I: 0, S: 0, C: 0 };
  for (const type of ['D', 'I', 'S', 'C'] as DISCType[]) {
    scores[type] += countKeywords(text, DISC_KEYWORDS[type]);
  }
  return scores;
}

// ─── 辅助：合并分数 ───────────────────────────────────────────────────────────

function addScores(
  base: Record<DISCType, number>,
  delta: Record<DISCType, number>,
): Record<DISCType, number> {
  return {
    D: base.D + delta.D,
    I: base.I + delta.I,
    S: base.S + delta.S,
    C: base.C + delta.C,
  };
}

// ─── 核心推断函数 ─────────────────────────────────────────────────────────────

/**
 * 基于 LinkedIn 公开信息推断 DISC 人格类型。
 *
 * @param profile LinkedIn 档案数据
 * @returns DISCResult 含主/次类型、置信度、接触策略等
 */
export function inferDISC(profile: LinkedInProfile): DISCResult {
  const scores: Record<DISCType, number> = { D: 0, I: 0, S: 0, C: 0 };
  const evidence: string[] = [];

  // 1. 文本信号：headline + summary + skills
  const textBlob = [
    profile.headline ?? '',
    profile.summary ?? '',
    ...(profile.skills ?? []),
  ].join(' ');

  const textScores = scoreTextForDisc(textBlob);
  addScores(scores, textScores); // merge below
  scores.D += textScores.D;
  scores.I += textScores.I;
  scores.S += textScores.S;
  scores.C += textScores.C;

  if (textScores.D > 0) evidence.push(`职位/简介含 D 型关键词 ×${textScores.D}（如 "founder/driven/growth"）`);
  if (textScores.I > 0) evidence.push(`职位/简介含 I 型关键词 ×${textScores.I}（如 "passionate/community"）`);
  if (textScores.S > 0) evidence.push(`职位/简介含 S 型关键词 ×${textScores.S}（如 "dedicated/partnership"）`);
  if (textScores.C > 0) evidence.push(`职位/简介含 C 型关键词 ×${textScores.C}（如 "analyze/metrics"）`);

  // 2. 发帖内容信号
  const posts = profile.posts ?? [];
  if (posts.length > 0) {
    const postBlob = posts.join(' ');
    const postScores = scoreTextForDisc(postBlob);
    scores.D += postScores.D;
    scores.I += postScores.I;
    scores.S += postScores.S;
    scores.C += postScores.C;

    // 帖子数量信号
    if (posts.length > 10) {
      scores.I += 2;
      evidence.push(`发帖频繁（${posts.length} 条），I 型 +2`);
    } else if (posts.length === 0) {
      scores.S += 1;
      scores.C += 1;
      evidence.push('发帖极少，倾向 S 或 C 型 +1');
    }

    // 平均帖子长度信号
    const avgLength = postBlob.length / posts.length;
    if (avgLength > 300) {
      scores.C += 2;
      evidence.push(`平均帖子长度 ${Math.round(avgLength)} 字 > 300，C 型 +2`);
    }
  } else {
    scores.S += 1;
    scores.C += 1;
    evidence.push('无公开发帖记录，轻微倾向 S/C 型 +1');
  }

  // 3. 职业路径信号
  const jobs = profile.jobHistory ?? [];
  if (jobs.length > 0) {
    const totalMonths = jobs.reduce((sum, j) => sum + j.durationMonths, 0);
    const avgTenure = totalMonths / jobs.length;

    if (avgTenure < 18) {
      scores.D += 3;
      evidence.push(`平均任期 ${Math.round(avgTenure)} 个月 < 18 个月，D 型 +3（高频跳槽，结果导向）`);
    } else if (avgTenure > 60) {
      scores.S += 3;
      evidence.push(`平均任期 ${Math.round(avgTenure)} 个月 > 60 个月，S 型 +3（稳定忠诚）`);
    }

    // 同一技术领域判断（检测职位重叠）
    const titles = jobs.map(j => j.title.toLowerCase());
    const techKeywords = ['engineer', 'developer', 'architect', 'scientist', 'analyst', '工程师', '研究员', '数据'];
    const techJobCount = titles.filter(t => techKeywords.some(k => t.includes(k))).length;
    if (techJobCount > 3) {
      scores.C += 2;
      evidence.push(`${techJobCount} 个技术类职位，C 型 +2（深耕专业领域）`);
    }

    // 跨行业跳跃（检测公司多样性，简化用职位名差异）
    const companies = jobs.map(j => j.company);
    const uniqueCompanies = new Set(companies).size;
    if (uniqueCompanies > 3 && avgTenure < 30) {
      scores.D += 2;
      scores.I += 2;
      evidence.push(`跨越 ${uniqueCompanies} 家不同公司，D/I 型 +2（多元经历，善于拓展）`);
    }
  }

  // 4. 人脉数量信号
  if (profile.connectionsCount !== undefined) {
    if (profile.connectionsCount > 1000) {
      scores.I += 2;
      evidence.push(`人脉 ${profile.connectionsCount}+ 人，I 型 +2（高社交活跃度）`);
    } else if (profile.connectionsCount < 200) {
      scores.C += 1;
      scores.S += 1;
      evidence.push(`人脉 ${profile.connectionsCount} 人较少，C/S 型 +1（低调、专注）`);
    }
  }

  // ─── 计算主/次类型与置信度 ──────────────────────────────────────────────────
  const totalScore = scores.D + scores.I + scores.S + scores.C;
  const sortedTypes = (['D', 'I', 'S', 'C'] as DISCType[]).sort((a, b) => scores[b] - scores[a]);
  const primary = sortedTypes[0];
  const secondaryCandidate = sortedTypes[1];
  const secondary = scores[secondaryCandidate] > 0 ? secondaryCandidate : undefined;

  // 置信度：主类型得分占比，加上相对优势系数
  let confidence = 0.4; // 基础置信度（信息不足时的默认值）
  if (totalScore > 0) {
    const dominance = scores[primary] / totalScore;
    const gap = secondary ? (scores[primary] - scores[secondary]) / (scores[primary] + 1) : 1;
    confidence = Math.min(0.95, 0.4 + dominance * 0.4 + gap * 0.15);
  }

  // ─── 生成接触策略 ─────────────────────────────────────────────────────────
  const strategyMap: Record<DISCType, string> = {
    D: '直接切入核心价值，第一句话就讲结果和 ROI，不要铺垫。简短、有力，给 TA 控制感——让 TA 做决定，不要把方案全盘托出，而是提问引导。',
    I: '先建立人情，提到共同认识的人或共同话题。语气热情，强调影响力和团队价值。可以适当"激动"一下，让 TA 感受到你的能量。',
    S: '循序渐进，不要急于推销。先了解 TA 的现状和需求，强调长期合作、稳定性和可靠性。给 TA 充分的时间考虑，承诺不给压力。',
    C: '用数据说话，准备好详细资料和案例。提前发送信息让 TA 先研究，见面时准备回答深度技术问题。逻辑严密，不要夸大。',
  };

  // ─── 风险警告 ─────────────────────────────────────────────────────────────
  const riskMap: Record<DISCType, string[]> = {
    D: [
      '不要浪费 TA 的时间——超过 15 分钟的 PPT 是红线',
      '避免模糊承诺，TA 对不确定性耐受度极低',
      '不要试图主导对话，给 TA 空间做决策',
    ],
    I: [
      '不要只讲数据，TA 的决策受情绪驱动，数据是辅助',
      '跟进频率不能太低，否则热情消退快',
      '警惕 TA 答应但不落实——需要具体行动项',
    ],
    S: [
      '不要催促，TA 需要时间内部讨论，急着逼单会引发抵触',
      '避免突然变化方案，TA 偏好稳定可预期的合作',
      '需要建立信任后才会真正开放，首次接触不宜过深',
    ],
    C: [
      '不要夸大承诺——TA 会验证每一个数据点',
      '避免仓促推进，TA 需要完整的信息才能决策',
      '不要绕过细节，TA 认为细节=专业度',
    ],
  };

  // ─── 最优渠道 ─────────────────────────────────────────────────────────────
  const channelMap: Record<DISCType, DISCResult['optimalChannel']> = {
    D: 'email',
    I: 'linkedin_dm',
    S: 'warm_intro',
    C: 'email',
  };

  // ─── 开场白模板 ───────────────────────────────────────────────────────────
  const openingMap: Record<DISCType, string> = {
    D: `Hi ${profile.name.split(' ')[0]}，看到你在 [公司] 推动了 [具体成果]。我有一个方案可以在 90 天内帮你实现类似结果——3 分钟值得聊吗？`,
    I: `Hi ${profile.name.split(' ')[0]}！我们有共同认识的 [mutual]，TA 一直说你在 [领域] 的影响力是独一无二的。我正在做一件可能让你兴奋的事——`,
    S: `Hi ${profile.name.split(' ')[0]}，我关注你在 [公司] 的工作已经有一段时间了，非常认可你们团队在 [方向] 上的坚持。不是来推销的，只是想了解你们目前的挑战——`,
    C: `Hi ${profile.name.split(' ')[0]}，我们最近完成了一项关于 [行业] 的研究，数据显示 [具体发现]。我认为这和你在 [公司] 负责的 [方向] 高度相关，是否方便分享完整报告？`,
  };

  return {
    primary,
    secondary,
    confidence: Math.round(confidence * 100) / 100,
    scores,
    evidence: evidence.length > 0 ? evidence : ['信息不足，基于默认基线推断'],
    approachStrategy: strategyMap[primary],
    riskWarnings: riskMap[primary],
    optimalChannel: channelMap[primary],
    openingLineTemplate: openingMap[primary],
  };
}

/*
 * ─── 单元测试说明 ────────────────────────────────────────────────────────────
 *
 * 手动测试示例（在 Node REPL 或 Jest 中运行）：
 *
 * import { inferDISC } from './disc';
 *
 * // 测试 D 型：founder，短任期，结果关键词
 * const dProfile = {
 *   name: 'Alex Chen',
 *   headline: 'Founder & CEO | 3x revenue growth | Scale SaaS',
 *   summary: 'Built and led multiple teams. Achieved $10M ARR. P&L owner.',
 *   jobHistory: [
 *     { title: 'CEO', company: 'StartupA', durationMonths: 12 },
 *     { title: 'VP Sales', company: 'ScaleupB', durationMonths: 14 },
 *     { title: 'Founder', company: 'StartupC', durationMonths: 10 },
 *     { title: 'Director', company: 'CorpD', durationMonths: 8 },
 *   ],
 * };
 * const dResult = inferDISC(dProfile);
 * console.assert(dResult.primary === 'D', 'Should be D type');
 * console.assert(dResult.confidence > 0.6, 'Confidence should be high');
 *
 * // 测试 C 型：技术领域多个职位，数据关键词，长帖
 * const cProfile = {
 *   name: 'Wei Zhang',
 *   headline: 'Senior Data Scientist | Research | Machine Learning',
 *   summary: 'Systematic approach to data analysis. Evidence-based decision making.',
 *   jobHistory: [
 *     { title: 'Data Scientist', company: 'A', durationMonths: 36 },
 *     { title: 'ML Engineer', company: 'B', durationMonths: 48 },
 *     { title: 'Research Analyst', company: 'C', durationMonths: 60 },
 *     { title: 'Data Analyst', company: 'D', durationMonths: 72 },
 *   ],
 *   posts: ['长篇技术文章...'.repeat(100)], // avgLength > 300
 * };
 * const cResult = inferDISC(cProfile);
 * console.assert(cResult.primary === 'C', 'Should be C type');
 *
 * // 测试 I 型：高人脉，高发帖频率，热情关键词
 * const iProfile = {
 *   name: 'Sarah Li',
 *   headline: 'Community Builder | Passionate about culture | Connect & inspire',
 *   summary: 'Love building amazing teams and sharing stories.',
 *   posts: Array(15).fill('Excited to share this amazing opportunity with our community!'),
 *   connectionsCount: 1500,
 * };
 * const iResult = inferDISC(iProfile);
 * console.assert(iResult.primary === 'I', 'Should be I type');
 *
 * // 测试 S 型：长任期，稳定关键词
 * const sProfile = {
 *   name: 'Tom Wang',
 *   headline: 'Dedicated partnership manager | Long-term relationship builder',
 *   summary: 'Committed to supporting teams with loyalty and trust.',
 *   jobHistory: [
 *     { title: 'Account Manager', company: 'Corp', durationMonths: 84 },
 *   ],
 * };
 * const sResult = inferDISC(sProfile);
 * console.assert(sResult.primary === 'S', 'Should be S type');
 */
