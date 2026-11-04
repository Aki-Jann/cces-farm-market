const PLATFORM_NAME = 'Tiangge Verde'

export function getFarmerDisplayName(
  profile: Record<string, unknown> | undefined,
  fallback = 'Farmer'
): string {
  for (const value of [profile?.farmName, profile?.displayName]) {
    if (typeof value !== 'string') continue
    const name = value.trim()
    if (name && name.toLocaleLowerCase() !== PLATFORM_NAME.toLocaleLowerCase()) return name
  }
  return fallback
}
