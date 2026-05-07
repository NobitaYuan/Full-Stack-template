const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
}

const HTML_ENTITY_REGEX = /[&<>"']/g

function escapeHtml(str: string): string {
  return str.replace(HTML_ENTITY_REGEX, (char) => HTML_ENTITIES[char] ?? char)
}

export function sanitizeInput<T>(value: T): T {
  if (typeof value === 'string') {
    return escapeHtml(value) as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInput(item)) as T
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = sanitizeInput(val)
    }
    return result as T
  }

  return value
}
