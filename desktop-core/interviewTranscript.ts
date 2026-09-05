// Keep the original responsive dispatch timing. Long ASR fragments are
// disambiguated by the recent conversation context sent to the model.
export const ASR_SILENCE_COMMIT_MS = 900;
export const ASR_FINAL_COMMIT_MS = 180;
/** Only unfinished question fragments get this longer coalescing window. */
export const ASR_FRAGMENT_SETTLE_MS = 2_000;

export const INTERVIEW_CONTEXT_LIMITS = {
  // Keep the client request at or below the deployed service limits so the
  // backend can forward it without a second compaction pass.
  jobDescription: 4000,
  resumeText: 8000,
  recentConversation: 8000,
} as const;

const CONTEXT_OMISSION_MARKER = '\n…[中间内容已省略以加快响应]…\n';

/**
 * Limit repeated interview context without turning a long document into a
 * low-signal hard cut. The beginning normally contains the profile/summary,
 * while the end commonly contains recent projects, skills or conversation.
 */
export function limitContextPreservingEnds(value: string | undefined, maxChars: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length <= maxChars) return normalized;
  if (maxChars <= CONTEXT_OMISSION_MARKER.length) return normalized.slice(0, Math.max(0, maxChars));

  const available = maxChars - CONTEXT_OMISSION_MARKER.length;
  const headChars = Math.ceil(available * 0.72);
  const tailChars = available - headChars;
  return `${normalized.slice(0, headChars)}${CONTEXT_OMISSION_MARKER}${normalized.slice(-tailChars)}`;
}

export function limitInterviewRequestContext(context: {
  jobDescription?: string;
  resumeText?: string;
  recentConversation?: string;
}): {
  jobDescription?: string;
  resumeText?: string;
  recentConversation?: string;
} {
  return {
    jobDescription: limitContextPreservingEnds(context.jobDescription, INTERVIEW_CONTEXT_LIMITS.jobDescription),
    resumeText: limitContextPreservingEnds(context.resumeText, INTERVIEW_CONTEXT_LIMITS.resumeText),
    recentConversation: limitContextPreservingEnds(context.recentConversation, INTERVIEW_CONTEXT_LIMITS.recentConversation),
  };
}

export function normalizeTranscript(text: string): string {
  return text.replace(/::__id__\d+$/, '').replace(/\s+/g, ' ').trim();
}

export function mergeIncrementalTranscript(current: string, incoming: string): string {
  const next = normalizeTranscript(incoming);
  if (!next) return current;
  if (!current || next === current) return next || current;
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;
  const withoutPunctuation = (value: string) => value.replace(/[，。！？、,.!?；;：:\s]/g, '');
  if (withoutPunctuation(current) === withoutPunctuation(next)) return next.length >= current.length ? next : current;
  return next;
}

export function mergeFinalTranscript(current: string, incoming: string): string {
  const base = normalizeTranscript(current);
  const next = normalizeTranscript(incoming);
  if (!next) return base;
  if (!base) return next;
  if (next === base || base.endsWith(` ${next}`)) return base;
  if (next.startsWith(base)) return next;
  if (base.startsWith(next)) return base;
  const compact = (value: string) => value.replace(/[。！？.!?\s]/g, '');
  if (compact(base) === compact(next)) return next.length >= base.length ? next : base;
  const joiner = /[\u4e00-\u9fff]$/.test(base) && /^[\u4e00-\u9fff]/.test(next) ? '' : ' ';
  return normalizeTranscript(`${base}${joiner}${next}`);
}

export function composeTranscript(finalized: string, interim: string): string {
  const base = normalizeTranscript(finalized);
  const preview = normalizeTranscript(interim);
  if (!preview) return base;
  if (!base) return preview;
  if (preview.startsWith(base)) return preview;
  if (base.startsWith(preview)) return base;
  return mergeFinalTranscript(base, preview);
}

export function isLikelyInterviewQuestion(text: string, audioMode: 'demo' | 'formal' = 'demo'): boolean {
  const value = normalizeTranscript(text);
  if (value.length < 2) return false;
  const fillers = [
    /^(好的|好|嗯|啊|哦|呃|那个|这个|就是|然后|对|是的|不是|可以|行|ok|嗯嗯|哈哈|呵呵|哎呀|哇)[。！？?!,.，\s…]*$/i,
    /^(谢谢|感谢|辛苦了|麻烦了|不好意思|抱歉|没关系|不客气|thank you|thanks)[。！？?!,.，\s…]*$/i,
    /^(请坐|请进|你好|您好|哈喽|hello|hi)[。！？!?.…]*$/i,
  ];
  if (fillers.some((pattern) => pattern.test(value))) return false;
  const interviewerRequest = /^(?:(?:我|我们|我这边|我们这边).{0,12}(?:想问|想了解|想请你|希望你|请你)|i\s+(?:want|would like)\s+to\s+(?:ask|know|understand)|we\s+(?:want|would like)\s+to\s+(?:ask|know|understand))/i;
  if (interviewerRequest.test(value)) return true;
  const candidateAnswer = /^(我|我的|本人|我们|我曾经|我负责|在我看来|我认为|首先|其次|然后|最后|当时|具体来说|例如|比如|i\b|i'm\b|i've\b|my\b|we\b|in my experience\b|i think\b|i believe\b|first(?:ly)?\b|second(?:ly)?\b|for example\b|for instance\b)/i.test(value)
    || (/^(?:这个|该)(?:项目|经历|问题|场景)/.test(value) && /(?:是|中|里|上)/.test(value));
  if (candidateAnswer) return false;
  const directQuestion = /[?？]|请问|怎么|如何|为什么|什么|哪些|哪个|哪种|是否|能否|可不可以|可以吗|有没有|有.*吗|是什么|区别(?:是|在)?哪|你(?:会|能|有|对|觉得|认为|怎么看)|\b(?:how|what|why|when|where|which|who)\b|\b(?:can|could|would|will|do|did|have|has|are|were)\s+you\b|\btell\s+me\b|\bwalk\s+me\s+through\b|\bgive\s+me\s+an?\s+example\b/i;
  if (directQuestion.test(value)) return true;
  const interviewPrompt = /^(请|麻烦|能否|可以|介绍|讲|说|聊|谈|分享|举例|列举|描述|解释|分析|对比|总结|实现|编写|设计|假设|如果|遇到|谈谈|讲讲|说说|tell\b|describe\b|explain\b|discuss\b|share\b|compare\b|design\b|implement\b|write\b)/i;
  if (interviewPrompt.test(value)) return true;
  const commonShortQuestion = /^(自我介绍|职业规划|离职原因|期望薪资|薪资期望|项目经历|实习经历|失败经历|最大的优点|最大的缺点|为什么选你|为什么离职)[。！？!?.…]*$/;
  if (commonShortQuestion.test(value)) return true;
  const interviewTopic = /(?:看法|理解|原因|规划|期望|优势|缺点|挑战|困难|收获|职责|经验|项目|场景|原理|流程|步骤|方案)$/;
  if (interviewTopic.test(value.replace(/[，。！？、,.!?；;：:\s]/g, ''))) return true;
  if (audioMode === 'demo') return value.length >= 4;
  return value.replace(/[，。！？、,.!?；;：:\s]/g, '').length >= 8;
}

/**
 * ASR final events are often phrase fragments rather than complete questions.
 * Hold only these clearly unfinished fragments briefly; complete short questions
 * keep the fast submission path.
 */
export function isLikelyIncompleteInterviewFragment(text: string): boolean {
  const normalized = normalizeTranscript(text);
  const value = normalized.replace(/[，,。！？!?；;：:]+$/g, '').trim();
  if (!value || /[。！？!?]$/.test(normalized)) return false;
  return /(?:如果|因为|所以|然后|并且|以及|但是|还有|另外|关于|对于|当|当时|在|从|到|和|与|或|请你|你来|能不能|能否|是否)$/.test(value);
}

