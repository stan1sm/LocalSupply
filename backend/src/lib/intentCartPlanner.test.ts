import { describe, expect, it, vi } from 'vitest'
import { planMealFromText } from './intentCartPlanner.js'

vi.mock('./aiClient.js', () => ({
  completeJson: vi.fn(async (_options: { systemPrompt: string; userPrompt: string; jsonSchema?: unknown }) => ({
    result: {
      mealType: 'taco_night',
      people: 4,
      notes: 'Norwegian-style tacos with beef',
      slots: [
        { role: 'protein', tags: ['Kjøtt', 'kjøttdeig', 'karbonadedeig', 'ground beef', 'minced meat', 'taco meat'], required: true },
        { role: 'tortillas', tags: ['Tortilla og wrap', 'tortillalefser', 'tortilla'], required: true },
        { role: 'cheese', tags: ['Gulost', 'revet ost', 'cheddar'], required: true },
      ],
    },
    raw: {},
  })),
}))

describe('planMealFromText', () => {
  it('returns a normalized meal plan', async () => {
    const result = await planMealFromText('Taco night for 4 people', 'en')

    expect(result.mealType).toBe('taco_night')
    expect(result.people).toBe(4)
    expect(result.notes).toBe('Norwegian-style tacos with beef')
    expect(result.slots.length).toBe(3)
    expect(result.slots[0]!.role).toBe('protein')
    expect(result.slots[0]!.tags.length).toBeGreaterThan(0)
    expect(result.slots[0]!.required).toBe(true)
  })

  it('caps tags at 12 per slot', async () => {
    const result = await planMealFromText('Taco night', 'en')

    for (const slot of result.slots) {
      expect(slot.tags.length).toBeLessThanOrEqual(12)
    }
  })

  it('defaults to 2 people when not specified', async () => {
    const { completeJson } = await import('./aiClient.js')
    ;(completeJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        mealType: 'pasta',
        people: -1,
        notes: null,
        slots: [{ role: 'pasta', tags: ['Pasta og nudler', 'spaghetti'], required: true }],
      },
      raw: {},
    })

    const result = await planMealFromText('some pasta', 'en')
    expect(result.people).toBe(2)
  })

  it('filters out slots with empty tags', async () => {
    const { completeJson } = await import('./aiClient.js')
    ;(completeJson as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: {
        mealType: 'test',
        people: 2,
        notes: null,
        slots: [
          { role: 'good', tags: ['Kjøtt', 'biff'], required: true },
          { role: 'empty', tags: [], required: false },
        ],
      },
      raw: {},
    })

    const result = await planMealFromText('test', 'en')
    expect(result.slots.length).toBe(1)
    expect(result.slots[0]!.role).toBe('good')
  })
})
