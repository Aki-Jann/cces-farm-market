export type FarmerFilterEntry = { farmerId: string }

export function getFarmerOptions(
  farmerNames: Record<string, string>,
  orders: FarmerFilterEntry[],
  products: FarmerFilterEntry[],
) {
  const ids = new Set([
    ...Object.keys(farmerNames),
    ...orders.map((order) => order.farmerId).filter(Boolean),
    ...products.map((product) => product.farmerId).filter(Boolean),
  ])
  return [...ids].sort((first, second) =>
    (farmerNames[first] ?? first).localeCompare(farmerNames[second] ?? second)
  )
}
