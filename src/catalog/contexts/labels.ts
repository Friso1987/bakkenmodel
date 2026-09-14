import type { ContextId } from '../../core/model'

export const CONTEXT_LABEL: Record<ContextId, string> = {
  'stad-wijk': 'stad en wijk',
  polder: 'polder',
  stroomgebied: 'stroomgebied',
}

export function contextLabel(id: ContextId): string {
  return CONTEXT_LABEL[id] ?? id
}
