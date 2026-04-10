import { completeJson } from './aiClient.js'

type MealPlanSlot = {
  role: string
  tags: string[]
  required: boolean
}

export type MealPlanSpec = {
  mealType: string
  people: number
  notes: string | null
  slots: MealPlanSlot[]
}

const MEAL_PLAN_SCHEMA = {
  name: 'meal_plan',
  schema: {
    type: 'object',
    properties: {
      mealType: { type: 'string', description: 'Short identifier like "taco_night", "pasta_carbonara", "pizza"' },
      people: { type: 'integer', description: 'Number of people to cook for' },
      notes: { type: ['string', 'null'], description: 'Dietary notes or constraints' },
      slots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', description: 'Ingredient role, e.g. "protein", "pasta", "cheese"' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Search keywords: Norwegian catalog category first, then Norwegian product names, then English equivalents',
            },
            required: { type: 'boolean', description: 'True if the meal cannot work without this ingredient' },
          },
          required: ['role', 'tags', 'required'],
          additionalProperties: false,
        },
      },
    },
    required: ['mealType', 'people', 'notes', 'slots'],
    additionalProperties: false,
  },
} as const

export async function planMealFromText(
  text: string,
  language: 'en' | 'no' = 'en',
  catalogCategories: string[] = [],
): Promise<MealPlanSpec> {
  const categoryHint =
    catalogCategories.length > 0
      ? `\n\nAvailable Norwegian grocery catalog categories (use exact names as the first tag when possible):\n${catalogCategories.join(', ')}`
      : ''

  const systemPrompt = `You are a grocery meal planner for Norwegian households.
Given a short free-text request, return a JSON object describing what ingredients are needed.

Hard rules:
- Each slot tag list MUST start with the exact Norwegian grocery catalog category name that best matches the ingredient.
- After the category, include Norwegian product name keywords, then English equivalents.
- Generate 6-12 tags per slot for reliable matching across different product naming conventions.
- Include common Norwegian spelling variants (e.g. both "kjøttdeig" and "kjottdeig").
- For protein/meat slots always include specific Norwegian product keywords like "kjøttdeig", "kyllingfilet", "laks" etc. alongside the category.
- Default to 2 people if not specified.${categoryHint}`

  const userPrompt = `Language: ${language}

User request:
${text}

Return JSON with: mealType, people (integer), notes (string or null), slots (array).
Each slot: role (string), tags (array of 6-12 keyword strings), required (boolean).

Examples:

{"mealType":"taco_night","people":4,"notes":"Norwegian-style tacos with beef","slots":[
  {"role":"protein","tags":["Kjøtt","kjøttdeig","kjottdeig","karbonadedeig","storfe","ground beef","minced meat","taco meat"],"required":true},
  {"role":"tortillas","tags":["Tortilla og wrap","tortillalefser","lefse","tortilla","taco shells","wraps"],"required":true},
  {"role":"cheese","tags":["Gulost","revet ost","ost","taco cheese","shredded cheese","cheddar"],"required":true},
  {"role":"salsa","tags":["Sauser og marinader","salsa","taco sauce","tacosaus","dip"],"required":true},
  {"role":"vegetables","tags":["Grønnsaker","salat","tomat","agurk","mais","paprika","lettuce","corn"],"required":false},
  {"role":"seasoning","tags":["Krydderblandinger","taco krydder","tacokrydder","taco seasoning","spice mix"],"required":false}
]}

{"mealType":"pasta_carbonara","people":2,"notes":"Classic carbonara with bacon and parmesan","slots":[
  {"role":"pasta","tags":["Pasta og nudler","spaghetti","pasta","spagetti","linguine","tagliatelle"],"required":true},
  {"role":"bacon","tags":["Bacon","bacon","pancetta","guanciale","stekt bacon","røkt bacon"],"required":true},
  {"role":"cheese","tags":["Gulost","parmesan","parmigiano","ost","hard cheese","grana padano"],"required":true},
  {"role":"eggs","tags":["Egg","egg","eggs","frittgående egg","økologisk egg"],"required":true},
  {"role":"cream","tags":["Fløte","fløte","kremfløte","matfløte","cooking cream","heavy cream"],"required":false}
]}

{"mealType":"chicken_salad","people":2,"notes":"Light chicken salad","slots":[
  {"role":"protein","tags":["Kylling","kyllingfilet","kyllingbryst","kylling","chicken breast","chicken fillet"],"required":true},
  {"role":"greens","tags":["Salater","salat","bladsalat","ruccola","spinat","mixed greens","lettuce"],"required":true},
  {"role":"vegetables","tags":["Grønnsaker","tomat","agurk","paprika","rødløk","tomato","cucumber"],"required":true},
  {"role":"dressing","tags":["Sauser og marinader","dressing","vinaigrette","salatdressing","salad dressing"],"required":false}
]}

{"mealType":"pancakes_breakfast","people":3,"notes":"Norwegian pancakes for breakfast","slots":[
  {"role":"flour","tags":["Mel","hvetemel","mel","bakmel","flour","plain flour","all-purpose flour"],"required":true},
  {"role":"milk","tags":["Melk","melk","lettmelk","helmelk","whole milk","semi-skimmed milk"],"required":true},
  {"role":"eggs","tags":["Egg","egg","eggs","frittgående egg"],"required":true},
  {"role":"butter","tags":["Smør","smør","meierismør","butter","unsalted butter"],"required":true},
  {"role":"topping","tags":["Sukker","sukker","syltetøy","blåbærsyltetøy","jam","sugar","berry jam"],"required":false}
]}`

  const { result } = await completeJson<MealPlanSpec>({
    systemPrompt,
    userPrompt,
    jsonSchema: MEAL_PLAN_SCHEMA,
  })

  const people = Number.isFinite(result.people as number) && (result.people as number) > 0 ? result.people : 2

  const slots = Array.isArray(result.slots)
    ? result.slots
        .map((slot) => ({
          role: String(slot.role ?? '').slice(0, 64) || 'item',
          tags: Array.isArray(slot.tags)
            ? slot.tags
                .map((tag) => String(tag ?? '').trim())
                .filter((tag) => tag.length > 0)
                .slice(0, 12)
            : [],
          required: Boolean(slot.required),
        }))
        .filter((slot) => slot.tags.length > 0)
    : []

  return {
    mealType: String(result.mealType ?? '').slice(0, 64) || 'meal',
    people,
    notes: typeof result.notes === 'string' ? result.notes.slice(0, 256) : null,
    slots,
  }
}
