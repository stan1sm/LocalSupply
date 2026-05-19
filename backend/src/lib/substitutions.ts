const TOKEN_STOP_WORDS = new Set([
  'coop', 'meny', 'rema', 'rema1000', 'spar', 'joker', 'kiwi', 'bunnpris', 'oda',
  'nrg', 'prior', 'gilde', 'tine', 'stabburet', 'norgesgruppen', 'ica', 'extra',
  'den', 'norske', 'the', 'and', 'for', 'med', 'fra', 'til', 'uten', 'eller',
])

export function tokenise(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-zæøå0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !/^\d/.test(token) && !TOKEN_STOP_WORDS.has(token))
}

export function hasTokenOverlap(name: string | null | undefined, baseTokens: Set<string>): boolean {
  return tokenise(name).some((t) => baseTokens.has(t))
}
