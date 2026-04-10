import { completeJson } from './aiClient.js'

type RecipeIngredient = {
  name: string
  amount: string
  essential: boolean
}

type Recipe = {
  title: string
  servings: number
  ingredients: RecipeIngredient[]
}

export type MealIngredient = {
  product: string
  searchTerms: string[]
  required: boolean
  qty: number
}

export type MealPlanSpec = {
  mealType: string
  people: number
  notes: string | null
  ingredients: MealIngredient[]
}

const RECIPE_SCHEMA = {
  name: 'recipe',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short recipe title' },
      servings: { type: 'integer', description: 'Number of servings' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Ingredient name in Norwegian as you would find it in a grocery store' },
            amount: { type: 'string', description: 'Quantity with unit, e.g. "400g", "2 stk", "1 boks", "3 ss"' },
            essential: { type: 'boolean', description: 'True if the dish does not work without this ingredient' },
          },
          required: ['name', 'amount', 'essential'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'servings', 'ingredients'],
    additionalProperties: false,
  },
} as const

async function generateRecipe(text: string, language: 'en' | 'no'): Promise<Recipe> {
  const systemPrompt = `You are a cooking expert who writes recipes for Norwegian home cooks.
Given a meal request (which may be in English, Norwegian, or any language), generate a complete recipe with an ingredient list.

Critical rules:
- The user's request can be in ANY language — understand it and generate the recipe.
- Ingredient names MUST ALWAYS be written in Norwegian, exactly as they appear in Norwegian grocery stores (e.g. "kjøttdeig av storfe", "tortillalefser", "revet ost", "lettrømme", "hvitløk", "løk", "olivenolje").
- NEVER write ingredient names in English. Even if the user writes in English, ingredients must be Norwegian. "ground beef" → "kjøttdeig", "garlic" → "hvitløk", "olive oil" → "olivenolje", "chicken breast" → "kyllingfilet".
- Use specific raw ingredient names, not prepared products. Write "kjøttdeig" (raw minced meat), NOT "kjøttdeigsaus" (ready-made sauce). Write "revet ost" (shredded cheese), NOT "ostesnacks" (cheese snacks).
- Include all ingredients needed for a complete dish, including basics like olje, salt, pepper, krydder.
- Scale amounts to the number of servings.
- Default to 2 servings if not specified.
- The amount field should use Norwegian grocery units: g, kg, stk, pakke, boks, dl, ss (tablespoon), ts (teaspoon).`

  const titleLanguage = language === 'no' ? 'Norwegian' : 'English'

  const userPrompt = `Request: ${text}

Return a JSON recipe. Write the title in ${titleLanguage}. Servings as integer. Ingredients array where each ingredient has name (ALWAYS in Norwegian as found in grocery stores), amount (with unit), and essential (boolean).`

  const { result } = await completeJson<Recipe>({
    systemPrompt,
    userPrompt,
    jsonSchema: RECIPE_SCHEMA,
  })

  return {
    title: String(result.title ?? '').slice(0, 128) || 'Meal',
    servings: Number.isFinite(result.servings) && result.servings > 0 ? result.servings : 2,
    ingredients: Array.isArray(result.ingredients)
      ? result.ingredients
          .map((ing) => ({
            name: String(ing.name ?? '').trim().slice(0, 128),
            amount: String(ing.amount ?? '').trim().slice(0, 32),
            essential: Boolean(ing.essential),
          }))
          .filter((ing) => ing.name.length > 0)
      : [],
  }
}

function parseQty(amount: string): number {
  const match = amount.match(/(\d+(?:[.,]\d+)?)/)
  if (!match) return 1
  const n = parseFloat(match[1]!.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 1
}

function buildSearchTerms(ingredientName: string): string[] {
  const terms: string[] = [ingredientName]
  const words = ingredientName
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length >= 3)
  for (const word of words) {
    if (!terms.includes(word)) terms.push(word)
  }
  return terms.slice(0, 8)
}

export async function planMealFromText(
  text: string,
  language: 'en' | 'no' = 'en',
  _catalogCategories: string[] = [],
): Promise<MealPlanSpec> {
  const recipe = await generateRecipe(text, language)

  const ingredients: MealIngredient[] = recipe.ingredients.map((ing) => ({
    product: ing.name,
    searchTerms: buildSearchTerms(ing.name),
    required: ing.essential,
    qty: parseQty(ing.amount),
  }))

  const mealType = recipe.title
    .toLowerCase()
    .replace(/[^a-zæøå0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 64) || 'meal'

  return {
    mealType,
    people: recipe.servings,
    notes: null,
    ingredients,
  }
}
