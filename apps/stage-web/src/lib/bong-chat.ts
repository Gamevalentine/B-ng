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
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta'
const SYSTEM_INSTRUCTION = 'Bạn là BÔNG, trợ lý AI thân thiện và hữu ích. Ưu tiên giao tiếp bằng tiếng Việt tự nhiên, rõ ràng và ngắn gọn. Đây là bản thử nghiệm trên trình duyệt, chưa có khả năng điều khiển máy tính, quan sát màn hình hay truy cập dữ liệu cá nhân. Không được tuyên bố rằng bạn đã thực hiện thao tác trên PC.'

/** This is explicitly a scripted UI test, not an AI completion. */
export function offlinePreviewReply(input: string): string {
  const normalized = input.trim().toLocaleLowerCase('vi')
  if (/^(xin chào|chào|hello|hi|chào bông)[!?.\s]*$/i.test(normalized))
    return 'Chào bạn! Mình là BÔNG. Đây là câu trả lời mô phỏng để thử giao diện; hãy chọn “AI thật” và kết nối API của bạn để trò chuyện với mô hình.'
  return 'BÔNG đã nhận được tin nhắn của bạn. Đây chỉ là phản hồi mô phỏng giao diện, chưa xử lý bằng mô hình AI. Hãy chọn “AI thật” để nhận câu trả lời thực sự.'
}

export async function generateBongReply(options: GenerateBongReplyOptions): Promise<string> {
  const { apiKey, model, history, signal, fetchImpl = fetch } = options
  const key = apiKey.trim()

  if (!key)
    throw new Error('Bạn cần nhập API key cá nhân để dùng AI thật.')
  if (!/^gemini-[a-zA-Z0-9.-]{3,70}$/.test(model))
    throw new Error('Tên mô hình không hợp lệ.')
  if (!history.length || history[history.length - 1]?.role !== 'user')
    throw new Error('Hội thoại cần có tin nhắn người dùng.')

  const contents = history.slice(-12).map(turn => ({
    role: turn.role,
    parts: [{ text: turn.text.slice(0, 4000) }],
  }))

  // Key is carried in the request header, NEVER in URL/query/logs/storage.
  const response = await fetchImpl(`${GEMINI_ENDPOINT}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents,
      generationConfig: { maxOutputTokens: 450, temperature: 0.7 },
    }),
    signal,
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  })

  if (!response.ok) {
    if (response.status === 400 || response.status === 401)
      throw new Error('API key hoặc yêu cầu không hợp lệ. Hãy kiểm tra cấu hình Gemini.')
    if (response.status === 403)
      throw new Error('Dự án Gemini chưa được cấp quyền. Kiểm tra quyền API hoặc giới hạn tài khoản.')
    if (response.status === 404)
      throw new Error('Không tìm thấy mô hình Gemini đã chọn.')
    if (response.status === 429)
      throw new Error('Đã tới hạn mức API Gemini. BÔNG không tự chuyển sang dịch vụ trả phí.')
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
