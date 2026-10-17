type FinancialOrderStatus = {
  status?: unknown
  paymentStatus?: unknown
}

export function isOrderEligibleForFinancialTotals(order: FinancialOrderStatus): boolean {
  const status = typeof order.status === 'string' ? order.status.trim().toLowerCase() : ''
  const paymentStatus = typeof order.paymentStatus === 'string'
    ? order.paymentStatus.trim().toLowerCase()
    : ''

  return paymentStatus === 'paid' && !['cancelled', 'canceled', 'rejected'].includes(status)
}
