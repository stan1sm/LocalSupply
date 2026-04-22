import { describe, expect, it, vi } from 'vitest'
import { planMealFromText } from './intentCartPlanner.js'

const makeTacoIngredients = () => [
  { name: 'kjøttdeig av storfe', amount: '800g', packageCount: 2, essential: true, searchTerms: ['kjøttdeig av storfe', 'kjøttdeig', 'storfe', 'kvernet kjøtt'] },
  { name: 'tortillalefser', amount: '8 stk', packageCount: 1, essential: true, searchTerms: ['tortillalefser', 'tortilla', 'wraps', 'lefser'] },
  { name: 'revet ost', amount: '200g', packageCount: 1, essential: true, searchTerms: ['revet ost', 'raspet ost', 'ost', 'cheddar'] },
  { name: 'tacokrydder', amount: '1 pakke', packageCount: 1, essential: true, searchTerms: ['tacokrydder', 'tacokrydder pose', 'krydderblanding'] },
  { name: 'isbergsalat', amount: '1 stk', packageCount: 1, essential: false, searchTerms: ['isbergsalat', 'salat', 'iceberg'] },
]

vi.mock('./aiClient.js', () => ({
  completeJson: vi.fn(async (_options: { systemPrompt: string; userPrompt: string; jsonSchema?: unknown }) => ({
    result: {
      title: 'Taco',
      servings: 4,
      ingredients: makeTacoIngredients(),
    },
    raw: {},
  })),
}))

describe('planMealFromText', () => {
  it('returns a normalized meal plan with ingredients from recipe', async () => {
    const result = await planMealFromText('Taco night for 4 people', 'en')

    expect(result.mealType).toBe('taco')
    expect(result.people).toBe(4)
    expect(result.ingredients.length).toBe(5)
    expect(result.ingredients[0]!.product).toBe('kjøttdeig av storfe')
    expect(result.ingredients[0]!.required).toBe(true)
  })

  it('uses packageCount for qty instead of gram quantity', async () => {
    const result = await planMealFromText('Taco night for 4 people', 'en')
    // 800g kjøttdeig → packageCount 2 (two 400g packs), not 800
    expect(result.ingredients[0]!.qty).toBe(2)
  })

  it('uses LLM-provided searchTerms', async () => {
    const result = await planMealFromText('Taco', 'en')

    const first = result.ingredients[0]!
    expect(first.searchTerms).toContain('kjøttdeig av storfe')
    expect(first.searchTerms).toContain('kjøttdeig')
    expect(first.searchTerms).toContain('storfe')
    expect(first.searchTerms.length).toBeGreaterThanOrEqual(3)
  })

  it('falls back to word-split searchTerms when LLM omits them', async () => {
    const { completeJson } = await import('./aiClient.js')
    ;(completeJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        title: 'Test',
        servings: 2,
        ingredients: [
          { name: 'kyllingfilet', amount: '400g', packageCount: 1, essential: true, searchTerms: [] },
        ],
      },
      raw: {},
    })

    const result = await planMealFromText('chicken', 'en')
    expect(result.ingredients[0]!.searchTerms).toContain('kyllingfilet')
  })

  it('falls back to packageCount 1 for weight-based amounts when LLM value is invalid', async () => {
    const { completeJson } = await import('./aiClient.js')
    ;(completeJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        title: 'Test',
        servings: 2,
        ingredients: [
          { name: 'salt', amount: 'etter smak', packageCount: null, essential: false, searchTerms: ['salt'] },
        ],
      },
      raw: {},
    })

    const result = await planMealFromText('test', 'en')
    expect(result.ingredients[0]!.qty).toBe(1)
  })

  it('defaults to 2 servings when invalid', async () => {
    const { completeJson } = await import('./aiClient.js')
    ;(completeJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        title: 'Pasta',
        servings: -1,
        ingredients: [
          { name: 'spaghetti', amount: '500g', packageCount: 1, essential: true, searchTerms: ['spaghetti', 'pasta'] },
        ],
      },
      raw: {},
    })

    const result = await planMealFromText('pasta', 'en')
    expect(result.people).toBe(2)
  })

  it('filters out ingredients with empty names', async () => {
    const { completeJson } = await import('./aiClient.js')
    ;(completeJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        title: 'Test',
        servings: 2,
        ingredients: [
          { name: 'spaghetti', amount: '500g', packageCount: 1, essential: true, searchTerms: ['spaghetti'] },
          { name: '', amount: '1', packageCount: 1, essential: false, searchTerms: [] },
        ],
      },
      raw: {},
    })

    const result = await planMealFromText('test', 'en')
    expect(result.ingredients.length).toBe(1)
    expect(result.ingredients[0]!.product).toBe('spaghetti')
  })

  it('clamps packageCount to 1–5 range', async () => {
    const { completeJson } = await import('./aiClient.js')
    ;(completeJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        title: 'Test',
        servings: 2,
        ingredients: [
          { name: 'smør', amount: '2kg', packageCount: 99, essential: true, searchTerms: ['smør'] },
        ],
      },
      raw: {},
    })

    const result = await planMealFromText('test', 'en')
    // packageCount 99 is out of range → fallback: 2kg smør → unit 'kg' → 1
    expect(result.ingredients[0]!.qty).toBe(1)
  })
})
