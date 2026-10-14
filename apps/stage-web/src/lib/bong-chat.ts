/**
 * Small, browser-only BÔNG web chat adapter.
 * Never embed a project-owned API token or send one to GitHub Pages.
 * The visitor's own key is accepted only at runtime and kept in Vue memory.
 */
export interface BongTurn {
  role: 'user' | 'model'
  text: string
}

export interface GenerateBongReplyOptions {
  apiKey: string
  model: string
  history: BongTurn[]
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  /** Called before one bounded retry after HTTP 500/502/503/504. */
  onRetry?: (status: number) => void
  /** Test injection; production uses an abort-aware backoff wait. */
  waitBeforeRetry?: (ms: number) => Promise<void>
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
const SUPPORTED_MODELS = new Set(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'])
const SYSTEM_INSTRUCTION = 'Bạn là BÔNG, trợ lý AI thân thiện và hữu ích. Ưu tiên giao tiếp bằng tiếng Việt tự nhiên, rõ ràng và ngắn gọn. Đây là bản thử nghiệm trên trình duyệt, chưa có khả năng điều khiển máy tính, quan sát màn hình hay truy cập dữ liệu cá nhân. Không được tuyên bố rằng bạn đã thực hiện thao tác trên PC.'

/** This is explicitly a scripted UI test, not an AI completion. */
export function offlinePreviewReply(input: string): string {
  const normalized = input.trim().toLocaleLowerCase('vi')
  if (/^(xin chào|chào|hello|hi|chào bông)[!?.\s]*$/i.test(normalized))
    return 'Chào bạn! Mình là BÔNG. Đây là câu trả lời mô phỏng để thử giao diện; hãy chọn “AI thật” và kết nối API của bạn để trò chuyện với mô hình.'
  return 'BÔNG đã nhận được tin nhắn của bạn. Đây chỉ là phản hồi mô phỏng giao diện, chưa xử lý bằng mô hình AI. Hãy chọn “AI thật” để nhận câu trả lời thực sự.'
}

/** Wait before retry without holding on to an aborted request. */
async function waitForServer(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted)
    throw new Error('Yêu cầu đã bị hủy hoặc quá thời gian chờ.')
  await new Promise<void>((resolve, reject) => {
    let finished = false
    const cleanup = () => {
      if (finished)
        return false
      finished = true
      signal?.removeEventListener('abort', abort)
      clearTimeout(timer)
      return true
    }
    const abort = () => {
      if (cleanup())
        reject(new Error('Yêu cầu đã bị hủy hoặc quá thời gian chờ.'))
    }
    const timer = setTimeout(() => {
      if (cleanup())
        resolve()
    }, ms)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted)
      abort()
  })
}

export async function generateBongReply(options: GenerateBongReplyOptions): Promise<string> {
  const { apiKey, model, history, signal, fetchImpl = fetch, onRetry, waitBeforeRetry } = options
  const key = apiKey.trim()

  if (!key)
    throw new Error('Bạn cần nhập API key cá nhân để dùng AI thật.')
  if (!SUPPORTED_MODELS.has(model))
    throw new Error('Tên mô hình không hợp lệ.')
  if (!history.length || history[history.length - 1]?.role !== 'user')
    throw new Error('Hội thoại cần có tin nhắn người dùng.')

  const recentHistory = history.slice(-12)
  while (recentHistory[0]?.role === 'model')
    recentHistory.shift()
  const contents = recentHistory.map(turn => ({
    role: turn.role,
    parts: [{ text: turn.text.slice(0, 4000) }],
  }))
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents,
    generationConfig: { maxOutputTokens: 450, temperature: 0.7 },
  })

  // Exactly one extra request on transient 5xx errors. Never retry quota
  // errors (429) or silently switch to a potentially billable model.
  const transientStatuses = new Set([500, 502, 503, 504])
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted)
      throw new Error('Yêu cầu đã bị hủy hoặc quá thời gian chờ.')

    let response: Response
    try {
      response = await fetchImpl(`${GEMINI_ENDPOINT}/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: requestBody,
        signal,
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        mode: 'cors',
      })
    }
    catch {
      if (signal?.aborted)
        throw new Error('Yêu cầu đã bị hủy hoặc quá thời gian chờ.')
      throw new Error('Không kết nối được Gemini từ trình duyệt. Kiểm tra mạng hoặc chính sách CORS của Google API.')
    }

    if (!response.ok && transientStatuses.has(response.status) && attempt === 0) {
      onRetry?.(response.status)
      const delayMs = 1100 + Math.floor(Math.random() * 400)
      if (waitBeforeRetry)
        await waitBeforeRetry(delayMs)
      else
        await waitForServer(delayMs, signal)
      continue
    }

    if (!response.ok) {
      if (response.status === 400 || response.status === 401)
        throw new Error('API key hoặc yêu cầu không hợp lệ. Hãy kiểm tra cấu hình Gemini.')
      if (response.status === 403)
        throw new Error('Dự án Gemini chưa được cấp quyền. Kiểm tra quyền API hoặc giới hạn tài khoản.')
      if (response.status === 404)
        throw new Error('Không tìm thấy mô hình Gemini đã chọn.')
      if (response.status === 429)
        throw new Error('Đã tới hạn mức Gemini (HTTP 429). BÔNG không tự thử lại hoặc chuyển sang dịch vụ trả phí.')
      if (transientStatuses.has(response.status))
        throw new Error(`Gemini gặp lỗi máy chủ HTTP ${response.status}, BÔNG đã thử lại một lần nhưng chưa thành công. Hãy chờ một chút rồi gửi lại hoặc tự chọn mô hình khác.`)
      if (response.status >= 500)
        throw new Error(`Gemini gặp sự cố HTTP ${response.status}. Hãy thử lại sau.`)
      throw new Error(`Gemini API gặp lỗi HTTP ${response.status}.`)
    }

    const payload = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const reply = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('').trim()
    if (!reply)
      throw new Error('Mô hình chưa trả về văn bản. Hãy thử câu hỏi khác.')
    return reply
  }

  throw new Error('Gemini chưa trả lời sau khi BÔNG thử lại.')
}
