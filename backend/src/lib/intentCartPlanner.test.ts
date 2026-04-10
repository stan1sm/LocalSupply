import { describe, expect, it, vi } from 'vitest'
import { planMealFromText } from './intentCartPlanner.js'

vi.mock('./aiClient.js', () => ({
  completeJson: vi.fn(async (_options: { systemPrompt: string; userPrompt: string; jsonSchema?: unknown }) => ({
    result: {
      title: 'Taco',
      servings: 4,
      ingredients: [
        { name: 'kjøttdeig av storfe', amount: '800g', essential: true },
        { name: 'tortillalefser', amount: '8 stk', essential: true },
        { name: 'revet ost', amount: '200g', essential: true },
        { name: 'tacokrydder', amount: '1 pakke', essential: true },
        { name: 'isbergsalat', amount: '1 stk', essential: false },
      ],
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
    expect(result.ingredients[0]!.qty).toBe(800)
  })

  it('generates searchTerms from ingredient name', async () => {
    const result = await planMealFromText('Taco', 'en')

    const first = result.ingredients[0]!
    expect(first.searchTerms).toContain('kjøttdeig av storfe')
    expect(first.searchTerms.length).toBeGreaterThan(1)
  })

  it('defaults qty to 1 when amount has no number', async () => {
    const { completeJson } = await import('./aiClient.js')
    ;(completeJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        title: 'Test',
        servings: 2,
        ingredients: [
          { name: 'salt', amount: 'etter smak', essential: false },
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
          { name: 'spaghetti', amount: '500g', essential: true },
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
          { name: 'spaghetti', amount: '500g', essential: true },
          { name: '', amount: '1', essential: false },
        ],
      },
      raw: {},
    })

    const result = await planMealFromText('test', 'en')
    expect(result.ingredients.length).toBe(1)
    expect(result.ingredients[0]!.product).toBe('spaghetti')
  })
})
