export class CurieExpander {
  private readonly prefixMap = new Map<string, string>()

  /** Accept either full root data (with @context key) or a context object directly. */
  constructor(input: Record<string, unknown>) {
    // If the input has a @context property, extract it; otherwise treat input AS the context
    const maybeContext = input['@context']
    if (maybeContext && typeof maybeContext === 'object' && !Array.isArray(maybeContext)) {
      this.buildPrefixMap(maybeContext as Record<string, unknown>)
    } else {
      this.buildPrefixMap(input)
    }
  }

  public expand(curie: string): string {
    const colonIdx = curie.indexOf(':')
    if (colonIdx < 1) return curie
    const prefix = curie.substring(0, colonIdx)
    const suffix = curie.substring(colonIdx + 1)
    const baseUri = this.prefixMap.get(prefix)
    if (!baseUri) return curie
    return suffix ? `${baseUri}${suffix}` : baseUri
  }

  private buildPrefixMap(context: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'string') {
        this.prefixMap.set(key, value)
      } else if (value && typeof value === 'object') {
        const v = value as Record<string, unknown>
        if (typeof v['@id'] === 'string' && !v['@id'].startsWith('@')) {
          this.prefixMap.set(key, v['@id'])
        }
      }
    }
  }
}
