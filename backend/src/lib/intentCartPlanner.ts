import { completeJson } from './aiClient.js'

type RecipeIngredient = {
  name: string
  amount: string
  packageCount: number
  essential: boolean
  searchTerms: string[]
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
      title: { type: 'string', description: 'Short recipe or shopping list title' },
      servings: { type: 'integer', description: 'Number of servings (default 2)' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Primary Norwegian ingredient name exactly as found in Norwegian grocery stores (e.g. "kjøttdeig av storfe", "kyllingfilet", "tortillalefser", "revet ost")',
            },
            amount: {
              type: 'string',
              description: 'Recipe quantity with unit (e.g. "400g", "2 stk", "1 boks", "3 ss"). This is the recipe quantity, not the cart quantity.',
            },
            packageCount: {
              type: 'integer',
              description: 'Number of standard grocery packages to add to cart (1–5). This is how many times the shopper picks this item off the shelf — NOT the recipe gram quantity. Standard Norwegian package sizes: kjøttdeig 400g, pasta 500g, ost 400g, fløte 3dl, rømme 3dl, melk 1L, smør 250g. So 800g kjøttdeig → packageCount 2, 500g pasta → packageCount 1, 1kg pasta → packageCount 2, 2 stk egg → packageCount 1 (one box of 6), 3 dl fløte → packageCount 1.',
            },
            essential: {
              type: 'boolean',
              description: 'True if the dish does not work without this ingredient. Set false for salt, pepper, vann, sukker, mel (small amounts), and other pantry staples most households already have.',
            },
            searchTerms: {
              type: 'array',
              description: '3–5 alternative Norwegian names and synonyms exactly as they appear in Norwegian grocery store catalogs (MENY, SPAR, JOKER, COOP, Oda). Include the primary name, important individual words, and any commonly used synonyms. Examples: "kjøttdeig av storfe" → ["kjøttdeig av storfe", "kjøttdeig", "storfe", "kvernet kjøtt"]; "tortillalefser" → ["tortillalefser", "tortilla", "wraps", "lefser"]; "kyllingfilet" → ["kyllingfilet", "kylling", "kyllingbryst"]; "hvitløk" → ["hvitløk", "hvitløksfedd"]; "passata" → ["passata", "tomatpuré", "hakkede tomater", "tomat"]; "revet ost" → ["revet ost", "raspet ost", "ost"].',
              items: { type: 'string' },
            },
          },
          required: ['name', 'amount', 'packageCount', 'essential', 'searchTerms'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'servings', 'ingredients'],
    additionalProperties: false,
  },
} as const

const SYSTEM_PROMPT = `You are a shopping assistant for a Norwegian grocery delivery platform (MENY, SPAR, JOKER, COOP, Oda).

Given a request in ANY language — a meal description, recipe name, or shopping list — produce a structured ingredient list that will be used to automatically search a Norwegian grocery catalog and build a cart.

═══ INGREDIENT NAMES ═══
Always use Norwegian ingredient names exactly as they appear in Norwegian grocery stores.
Use specific, searchable raw ingredient names:
• kjøttdeig av storfe (not "kjøttdeigsaus" or "tacokjøtt")
• kyllingfilet (not "grillkylling" or "kyllingmåltid")
• revet ost / raspet ost (not "ostesnacks" or "ost i skiver")
• laksefilet (not "laksemåltid")
• Common names: løk, hvitløk, paprika, tomat, agurk, gulrot, potet, eple, appelsin, banan, sitron
• Dairy: melk, fløte, rømme, smør, ost, yoghurt, egg
• Pantry: pasta, ris, mel, sukker, olje, olivenolje, salt, pepper, eddik, tacokrydder, karri, paprikapulver

═══ SEARCH TERMS ═══
The searchTerms array is the most important field for catalog matching.
Include 3–5 terms covering:
1. The full Norwegian name as written above
2. The key noun (shortest searchable form)
3. Any well-known synonyms or brand-neutral alternatives
4. English term ONLY if it is commonly used in Norwegian stores (e.g. "wraps", "cheddar", "pesto")

Good examples:
• "kjøttdeig av storfe" → ["kjøttdeig av storfe", "kjøttdeig", "storfe", "kvernet kjøtt"]
• "tortillalefser" → ["tortillalefser", "tortilla", "wraps", "lefser"]
• "kyllingfilet" → ["kyllingfilet", "kylling", "kyllingbryst", "kyllingkjøtt"]
• "hvitløk" → ["hvitløk", "hvitløksfedd", "garlic"]
• "passata" → ["passata", "tomatpuré", "hakkede tomater", "tomat"]
• "revet ost" → ["revet ost", "raspet ost", "ost", "cheddar"]
• "laks" → ["laks", "laksefilet", "laksestykke", "atlanterhavslaks"]
• "rødvin" → ["rødvin", "vin", "rødvinssaus"]
• "kokosmelk" → ["kokosmelk", "coconut milk", "kokosnøttmelk"]
• "pasta" → ["pasta", "spaghetti", "penne", "tagliatelle", "fusilli"]

═══ PACKAGE COUNT ═══
packageCount = how many packages the shopper picks off the shelf (1–5).
This is NOT the recipe quantity in grams. Think: how many times does someone reach for this item?

Standard Norwegian package sizes to reason about:
kjøttdeig 400g, kyllingfilet 400–600g, bacon 150–200g, laks 400g
pasta 500g, ris 1kg, mel 1kg
smør 250g, fløte 3dl (330ml), rømme 3dl, melk 1L, ost 400–500g, egg 6–12 pk
løk sold individually, tomater 500g pack, paprika individually
olivenolje 500ml, olje 1L, salt 1 boks, pepper 1 boks

Rules:
• Weight/volume units (g, kg, dl, L, ml) → calculate how many packages needed
  - 400g kjøttdeig = 1, 800g kjøttdeig = 2
  - 500g pasta = 1, 1kg pasta = 2
  - 3dl fløte = 1 (one 3dl carton), 6dl fløte = 2
• Count units (stk, pakke, boks, pk, pose) → use the count directly (max 5)
  - 2 egg stk → packageCount 1 (buy one egg carton)
  - 1 pakke tacokrydder → packageCount 1
• For basics used in small amounts (1 ss olje, litt salt) → always packageCount 1
• Never exceed 5

═══ ESSENTIAL FLAG ═══
Set essential=false for items most households already have or that barely affect the dish:
salt, pepper, sukker, vann, lite mel (dusting), 1 ss olje, krydder used in tiny amounts.
Set essential=true for all main ingredients and key flavourings (tacokrydder, hvitløk, løk, saus, etc.).

═══ HANDLING DIFFERENT REQUEST TYPES ═══
• Recipe request ("tacos til 4", "pasta carbonara", "Sunday roast") → generate a complete ingredient list for the dish
• Shopping list request ("kjøp melk, brød og ost") → treat each item as an ingredient, set all essential=true, packageCount=1 each, title="Shopping List"
• Dietary restrictions (vegetarian, halal, lactose-free, etc.) → fully respect and substitute appropriately
• Servings: use the number stated; default to 2 if not specified; scale amounts accordingly

═══ LANGUAGE ═══
The user's request can be in ANY language. Always understand it correctly. Ingredient names must always be Norwegian.`

/**
 * Sends a free-text meal or shopping request to the LLM and returns a structured recipe.
 * The recipe title language follows the `language` parameter; ingredient names are always Norwegian.
 */
async function generateRecipe(text: string, language: 'en' | 'no'): Promise<Recipe> {
  const titleLanguage = language === 'no' ? 'Norwegian' : 'English'

  const userPrompt = `Request: ${text}

Generate the ingredient list. Write the title in ${titleLanguage}. Return valid JSON matching the schema.`

  const { result } = await completeJson<Recipe>({
    systemPrompt: SYSTEM_PROMPT,
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
            packageCount: normalizePackageCount(ing.packageCount, String(ing.amount ?? '')),
            essential: Boolean(ing.essential),
            searchTerms: normalizeSearchTerms(ing.searchTerms, String(ing.name ?? '')),
          }))
          .filter((ing) => ing.name.length > 0)
      : [],
  }
}

/** Validates the LLM-provided packageCount (1–5 integer) and falls back to a heuristic if invalid. */
function normalizePackageCount(raw: unknown, amount: string): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 5) return raw
  return fallbackPackageCount(amount)
}

/** Derives a package count from an amount string (e.g. "800g" → 2, "3 stk" → 3) when the LLM value is unusable. */
function fallbackPackageCount(amount: string): number {
  const match = amount.match(/(\d+(?:[.,]\d+)?)\s*([a-zA-ZæøåÆØÅ]*)/)
  if (!match) return 1
  const num = parseFloat((match[1] ?? '1').replace(',', '.'))
  const unit = (match[2] ?? '').toLowerCase().trim()

  if (/^(g|kg|dl|l|ml|cl)$/.test(unit)) return 1
  if (/^(stk|pakke|pk|boks|pose|porsjon|skive)$/.test(unit)) {
    return Math.min(5, Math.max(1, Math.ceil(num)))
  }
  if (Number.isFinite(num) && num >= 1 && num <= 5) return Math.ceil(num)
  return 1
}

/** Cleans and deduplicates LLM-produced search terms; falls back to splitting the ingredient name if the array is malformed. */
function normalizeSearchTerms(raw: unknown, ingredientName: string): string[] {
  if (Array.isArray(raw)) {
    const cleaned = raw
      .map((t) => String(t ?? '').trim().toLowerCase())
      .filter((t) => t.length >= 2)
      .slice(0, 8)
    if (cleaned.length >= 2) return cleaned
  }
  return buildFallbackSearchTerms(ingredientName)
}

/** Builds basic search terms from an ingredient name by splitting on whitespace and commas. */
function buildFallbackSearchTerms(ingredientName: string): string[] {
  const terms: string[] = [ingredientName.toLowerCase()]
  const words = ingredientName
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length >= 3)
  for (const word of words) {
    if (!terms.includes(word)) terms.push(word)
  }
  return terms.slice(0, 8)
}

/**
 * Converts a free-text meal or shopping request into a structured `MealPlanSpec`
 * with per-ingredient search terms and quantities ready for catalog matching.
 * `_catalogCategories` is reserved for future filtering and is currently unused.
 */
export async function planMealFromText(
  text: string,
  language: 'en' | 'no' = 'en',
  _catalogCategories: string[] = [],
): Promise<MealPlanSpec> {
  const recipe = await generateRecipe(text, language)

  const ingredients: MealIngredient[] = recipe.ingredients.map((ing) => ({
    product: ing.name,
    searchTerms: ing.searchTerms,
    required: ing.essential,
    qty: ing.packageCount,
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
