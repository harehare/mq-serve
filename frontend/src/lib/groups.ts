import type { FileGroup } from '../types'

/** URL-safe slug for a sidebar group name, used as `/<slug>`. */
export function groupSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

/** The group slug in the current address bar path, or null for the root. */
export function slugFromLocation(): string | null {
  const seg = decodeURIComponent(window.location.pathname.split('/')[1] ?? '')
  return seg || null
}

export function groupsForSlug(groups: FileGroup[], slug: string | null): FileGroup[] {
  if (!slug) return groups
  const matched = groups.filter((g) => groupSlug(g.name) === slug)
  return matched.length > 0 ? matched : groups
}

/** Navigates to a group's own URL (or the root when slug is null) without reloading. */
export function navigateToGroup(slug: string | null): void {
  const path = slug ? `/${encodeURIComponent(slug)}` : '/'
  window.history.pushState(null, '', path + window.location.search)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
