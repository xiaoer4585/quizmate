export const ASR_SILENCE_COMMIT_MS = 1200
export const ASR_FINAL_COMMIT_MS = 120

export function normalizeTranscript(text: string): string {
  return text
    .replace(/::__id__\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mergeIncrementalTranscript(current: string, incoming: string): string {
  const next = normalizeTranscript(incoming)
  if (!next) return current
  if (!current || next === current) return next || current
  if (next.startsWith(current)) return next
  if (current.startsWith(next)) return current

  const withoutPunctuation = (value: string) => value.replace(/[，。！？、,.!?；;：:\s]/g, '')
  if (withoutPunctuation(current) === withoutPunctuation(next)) {
    return next.length >= current.length ? next : current
  }

  // Realtime ASR usually sends a corrected snapshot of the current sentence.
  return next
}

export function isLikelyInterviewQuestion(text: string): boolean {
  const value = normalizeTranscript(text)
  if (value.length < 2) return false

  const fillers = [
    /^(好的|好|嗯|啊|哦|呃|那个|这个|就是|然后|对|是的|不是|可以|行|OK|ok|嗯嗯|哈哈|呵呵|哎呀|哇)[。！？!?.…]*$/,
    /^(谢谢|感谢|辛苦了|麻烦了|不好意思|抱歉|没关系|不客气)[。！？!?.…]*$/,
    /^(请坐|请进|你好|您好|哈喽|hello|hi)[。！？!?.…]*$/i,
  ]
  if (fillers.some((pattern) => pattern.test(value))) return false

  const explicitQuestion = /[?？]|请问|怎么|如何|为什么|什么|哪些|哪个|哪种|是否|能否|可不可以|可以吗|有.*吗|是什么|区别|优缺点|觉得|看法|理解|原因|规划|期望|优势|缺点|挑战|困难|收获|职责|经验|项目|场景|原理|流程|步骤|方案/
  if (explicitQuestion.test(value)) return true

  const interviewPrompt = /^(请|麻烦|能否|可以|介绍|讲|说|聊|谈|分享|举例|列举|描述|解释|分析|对比|总结|实现|编写|设计|假设|如果|遇到)/
  if (interviewPrompt.test(value)) return true

  const commonShortQuestion = /^(自我介绍|职业规划|离职原因|期望薪资|薪资期望|项目经历|实习经历|失败经历|最大的优点|最大的缺点|为什么选你|为什么离职)[。！？!?.…]*$/
  if (commonShortQuestion.test(value)) return true

  // Interviewers often phrase questions as statements without a question mark.
  return value.replace(/[，。！？、,.!?；;：:\s]/g, '').length >= 8
}
