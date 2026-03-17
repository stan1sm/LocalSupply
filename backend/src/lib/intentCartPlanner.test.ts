import { describe, expect, it, vi } from 'vitest'
import { planMealFromText } from './intentCartPlanner.js'

vi.mock('./aiClient.js', () => ({
  completeJson: vi.fn(async () => ({
    result: {
      mealType: 'taco_night',
      people: 4,
      notes: 'Test meal',
      slots: [
        { role: 'protein', tags: ['kjøttdeig', 'taco'], required: true },
        { role: 'tortillas', tags: ['tortillalefser'], required: true },
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
    expect(result.slots.length).toBeGreaterThan(0)
    if (result.slots[0]) {
      expect(result.slots[0].tags.length).toBeGreaterThan(0)
    }
  })
})

