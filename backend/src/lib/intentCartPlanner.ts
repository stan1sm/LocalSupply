import { completeJson } from './aiClient.js'

type MealPlanSlot = {
  role: string
  tags: string[]
  required: boolean
}

export type MealPlanSpec = {
  mealType: string
  people: number
  notes?: string | undefined
  slots: MealPlanSlot[]
}

export async function planMealFromText(text: string, language: 'en' | 'no' = 'en'): Promise<MealPlanSpec> {
  const systemPrompt = `
You are a grocery meal planner for Norwegian households.
Given a short free-text request, you must return a strict JSON object that describes what ingredients are needed.

Always answer in the same JSON structure.

Supported languages: English (en) and Norwegian (no).

Do NOT include any explanations, only JSON.

Hard rules:
- If the user request is taco/tacos/taco night (or mealType indicates taco), you MUST include a "protein" slot with meat keywords (minced meat / ground beef) and mark it as required=true.
  - The slot tags MUST contain at least one Norwegian meat keyword, preferably "kjøttdeig" (and optionally "karbonadedeig", "biff" or "storfe").
  - The slot tags MUST also contain at least one English keyword: "ground beef" or "minced meat" (for cross-language matching).
`.trim()

  const userPrompt = `
Language: ${language}

User request:
${text}

Return a JSON object with:
- "mealType": a short identifier, e.g. "taco_night", "pasta", "pizza", "friday_treat"
- "people": integer number of people (guess if not specified, default 2)
- "notes": short free-text notes about dietary preferences or constraints
- "slots": array of ingredient slots, each with:
  - "role": e.g. "protein", "tortillas", "cheese", "salsa", "vegetables"
  - "tags": array of short keywords useful for searching the grocery catalog.
    IMPORTANT: always include both Norwegian and English grocery terms here, with Norwegian first.
    Example: ["smør", "butter"], ["kjøttdeig", "ground beef"].
  - "required": boolean, true if the meal does not make sense without this slot

Example (for taco night for 4 people):
{
  "mealType": "taco_night",
  "people": 4,
  "notes": "Norwegian style tacos, beef, with cheese and vegetables",
  "slots": [
    { "role": "protein", "tags": ["kjøttdeig", "karbonadedeig", "taco", "ground beef", "minced meat", "biff", "storfe"], "required": true },
    { "role": "tortillas", "tags": ["tortillalefser", "taco shells"], "required": true },
    { "role": "cheese", "tags": ["revet ost", "taco cheese"], "required": true },
    { "role": "salsa", "tags": ["salsa", "taco sauce"], "required": true },
    { "role": "vegetables", "tags": ["salat", "tomat", "agurk", "mais"], "required": false }
  ]
}
`.trim()

  const { result } = await completeJson<MealPlanSpec>({
    systemPrompt,
    userPrompt,
  })

  const people = Number.isFinite(result.people as number) && (result.people as number) > 0 ? result.people : 2
  let slots = Array.isArray(result.slots)
    ? result.slots
        .map((slot) => ({
          role: String(slot.role ?? '').slice(0, 64) || 'item',
          tags: Array.isArray(slot.tags)
            ? slot.tags
                .map((tag) => String(tag ?? '').trim())
                .filter((tag) => tag.length > 0)
                .slice(0, 8)
            : [],
          required: Boolean(slot.required),
        }))
        .filter((slot) => slot.tags.length > 0)
    : []

  const lowerMealType = String(result.mealType ?? '').toLowerCase()
  const lowerText = text.toLowerCase()
  const hasProtein = slots.some((slot) => {
    const role = slot.role.toLowerCase()
    const tags = slot.tags.map((t) => t.toLowerCase())
    const meatKeywords = [
      'kjøttdeig',
      'karbonadedeig',
      'biff',
      'storfe',
      'ground beef',
      'minced meat',
      'mince',
      'beef',
      'meat',
      'ground beef',
      'beef mince',
    ]
    const roleLooksProtein = role.includes('protein') || role.includes('kjøtt') || role.includes('meat')
    const tagsContainMeat = tags.some((tag) => meatKeywords.some((k) => tag.includes(k)))
    return roleLooksProtein || tagsContainMeat
  })

  const looksLikeTaco =
    lowerMealType.includes('taco') ||
    lowerText.includes('taco') ||
    slots.some((slot) => slot.tags.some((t) => t.toLowerCase().includes('taco')))

  if (looksLikeTaco && !hasProtein) {
    slots = [
      {
        role: 'protein',
        tags: [
          'kjøttdeig',
          'karbonadedeig',
          'biff',
          'storfe',
          'taco',
          'ground beef',
          'minced meat',
          'mince',
          'beef mince',
        ],
        required: true,
      },
      ...slots,
    ]
  }

  return {
    mealType: String(result.mealType ?? '').slice(0, 64) || 'meal',
    people,
    notes: typeof result.notes === 'string' ? result.notes.slice(0, 256) : undefined,
    slots,
  }
}

