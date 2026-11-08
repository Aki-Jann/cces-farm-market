export const ROLES = {
  CUSTOMER: 'customer',
  FARMER: 'farmer',
  CCES_ADMIN: 'cces_admin',
} as const

export type UserRole = typeof ROLES[keyof typeof ROLES]
export type ManagementRole = typeof ROLES.FARMER | typeof ROLES.CCES_ADMIN

export function normalizeRole(value: unknown): UserRole | null {
  if (value === ROLES.CUSTOMER) return ROLES.CUSTOMER
  if (value === ROLES.FARMER) return ROLES.FARMER
  if (value === ROLES.CCES_ADMIN) return ROLES.CCES_ADMIN
  return null
}
