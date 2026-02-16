import { useMemo } from 'react'

interface RotationInfo {
  rotatingCodes: Set<string>
  daysLeft: number
  monthStr: string
  rotatingSetNames: string[]
}

export function useRotationInfo(
  expansions: { code: string; name: string; standard: boolean; yearNum: number }[],
  maxDaysAhead = Infinity,
): RotationInfo | null {
  return useMemo(() => {
    const standardYearNums = [...new Set(
      expansions.filter(e => e.standard && e.code !== 'CORE').map(e => e.yearNum)
    )].sort((a, b) => a - b)
    if (standardYearNums.length < 2) return null
    const oldestYear = standardYearNums[0]
    const rotatingSets = expansions.filter(e => e.standard && e.yearNum === oldestYear && e.code !== 'CORE')
    const rotatingCodes = new Set(rotatingSets.map(e => e.code))
    const maxYear = Math.max(...standardYearNums)
    const rotationDate = new Date(maxYear, 2, 15)
    const daysLeft = Math.ceil((rotationDate.getTime() - Date.now()) / 86400000)
    if (daysLeft <= 0 || daysLeft > maxDaysAhead) return null
    const monthStr = rotationDate.toLocaleString('en', { month: 'short', year: 'numeric' })
    return { rotatingCodes, daysLeft, monthStr, rotatingSetNames: rotatingSets.map(s => s.name) }
  }, [expansions, maxDaysAhead])
}
