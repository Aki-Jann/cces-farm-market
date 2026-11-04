import styles from './FarmerFilter.module.css'

export function FarmerFilter({
  value,
  options,
  farmerNames,
  onChange,
}: {
  value: string
  options: string[]
  farmerNames: Record<string, string>
  onChange: (farmerId: string) => void
}) {
  return (
    <label className={styles.farmerFilter}>
      Farmer
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All farmers</option>
        {options.map((farmerId) => (
          <option key={farmerId} value={farmerId}>{farmerNames[farmerId] ?? farmerId}</option>
        ))}
      </select>
    </label>
  )
}
