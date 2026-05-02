/**
 * @module aiClient
 * Provides a thin, retry-capable client for OpenAI-compatible embedding and chat-completion APIs.
 */

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

/**
 * Returns a single embedding vector for the given text using the configured embedding model.
 * @param {string} text - The input text to embed.
 * @returns {Promise<number[]>} A floating-point vector representing the text embedding.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const { embeddingModel } = getConfig()

  const data = await callJsonApi<{
    data: Array<{ embedding: number[] }>
  }>('/v1/embeddings', { model: embeddingModel, input: text })

  if (!data.data?.[0]?.embedding) {
    throw new Error('AI embedding response did not contain embedding data.')
  }

  return data.data[0].embedding
}

/**
 * Returns embedding vectors for a batch of texts, preserving input order.
 * @param {string[]} texts - The array of input texts to embed.
 * @returns {Promise<number[][]>} An array of embedding vectors in the same order as the input.
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (texts.length === 1) return [await getEmbedding(texts[0]!)]

  const { embeddingModel } = getConfig()

  const data = await callJsonApi<{
    data: Array<{ index: number; embedding: number[] }>
  }>('/v1/embeddings', { model: embeddingModel, input: texts })

  if (!Array.isArray(data.data) || data.data.length === 0) {
    throw new Error('AI batch embedding response did not contain embedding data.')
  }

  const sorted = [...data.data].sort((a, b) => a.index - b.index)
  return sorted.map((item) => item.embedding)
}

/**
 * The parsed and raw result of a JSON chat-completion request.
 * @template T The expected shape of the parsed JSON response.
 * @property {T} result - The JSON payload parsed from the model's response content.
 * @property {unknown} raw - The raw API response object, useful for debugging or inspecting usage metadata.
 */
type JsonChatResponse<T> = {
  result: T
  raw: unknown
}

/**
 * Describes a named JSON Schema to enforce structured output from the chat model.
 * @property {string} name - The schema name passed to the model's `json_schema` response format.
 * @property {Record<string, unknown>} schema - The JSON Schema definition object.
 */
type JsonSchemaSpec = {
  name: string
  schema: Record<string, unknown>
}

/**
 * Sends a chat-completion request that returns a parsed JSON object of type `T`.
 * @template T The expected shape of the JSON value returned by the model.
 * @param {{ systemPrompt: string; userPrompt: string; jsonSchema?: JsonSchemaSpec }} options - Completion options.
 * @param {string} options.systemPrompt - The system-role message sent to the model.
 * @param {string} options.userPrompt - The user-role message sent to the model.
 * @param {JsonSchemaSpec} [options.jsonSchema] - Optional strict JSON Schema; when omitted the model is asked for free-form `json_object` output.
 * @returns {Promise<JsonChatResponse<T>>} An object containing the parsed result and the raw API response.
 */
export async function completeJson<T>(options: {
  systemPrompt: string
  userPrompt: string
  jsonSchema?: JsonSchemaSpec
}): Promise<JsonChatResponse<T>> {
  const { chatModel } = getConfig()

  const responseFormat = options.jsonSchema
    ? { type: 'json_schema' as const, json_schema: { name: options.jsonSchema.name, strict: true, schema: options.jsonSchema.schema } }
    : { type: 'json_object' as const }

  const response = await callJsonApi<any>('/v1/chat/completions', {
    model: chatModel,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.userPrompt },
    ],
    response_format: responseFormat,
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

