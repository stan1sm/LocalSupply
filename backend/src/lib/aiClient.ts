type AiProviderConfig = {
  baseUrl: string
  apiKey: string
  embeddingModel: string
  chatModel: string
}

function getConfig(): AiProviderConfig {
  const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? ''
  const baseUrl = (process.env.AI_BASE_URL ?? 'https://api.openai.com').replace(/\/+$/, '')
  const embeddingModel = process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small'
  const chatModel = process.env.AI_LLM_MODEL ?? 'gpt-4.1-mini'

  if (!apiKey) {
    throw new Error('AI_API_KEY (or OPENAI_API_KEY) is not configured.')
  }

  return { baseUrl, apiKey, embeddingModel, chatModel }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 400): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) await sleep(baseDelayMs * attempt)
    }
  }
  throw lastError
}

async function callJsonApi<T>(path: string, body: unknown): Promise<T> {
  const { baseUrl, apiKey } = getConfig()

  return withRetry(async () => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`AI API request failed (${response.status}): ${text || response.statusText}`)
    }

    return (await response.json()) as T
  })
}

export async function getEmbedding(text: string): Promise<number[]> {
  const { embeddingModel } = getConfig()

  const payload = {
    model: embeddingModel,
    input: text,
  }

  const data = await callJsonApi<{
    data: Array<{ embedding: number[] }>
  }>('/v1/embeddings', payload)

  if (!data.data?.[0]?.embedding) {
    throw new Error('AI embedding response did not contain embedding data.')
  }

  return data.data[0].embedding
}

type JsonChatResponse<T> = {
  result: T
  raw: unknown
}

export async function completeJson<T>(options: {
  systemPrompt: string
  userPrompt: string
}): Promise<JsonChatResponse<T>> {
  const { chatModel } = getConfig()

  const response = await callJsonApi<any>('/v1/chat/completions', {
    model: chatModel,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  })

  const content = response?.choices?.[0]?.message?.content

  if (typeof content !== 'string') {
    throw new Error('AI chat response did not contain string content.')
  }

  let parsed: T
  try {
    parsed = JSON.parse(content) as T
  } catch (error) {
    throw new Error(`Failed to parse AI JSON response: ${(error as Error).message}`)
  }

  return { result: parsed, raw: response }
}

