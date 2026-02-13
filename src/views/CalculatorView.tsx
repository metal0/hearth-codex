import { useState, useMemo } from 'react'
import { useStore } from '../stores/store.ts'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { DustIcon, GoldIcon, PackIcon } from '../components/Icons.tsx'

export default function CalculatorView() {
  const expansions = useStore(s => s.expansions)
  const collection = useStore(s => s.collection)
  const calculatorResults = useStore(s => s.calculatorResults)
  const calculatorLoading = useStore(s => s.calculatorLoading)
  const runCalculator = useStore(s => s.runCalculator)

  const standardCodes = useMemo(
    () => expansions.filter(e => e.standard).map(e => e.code),
    [expansions],
  )

  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [dust, setDust] = useState(collection?.dust ?? 0)
  const [mode, setMode] = useState<'standard' | 'wild' | 'custom'>('standard')


  const activeCodes = useMemo(() => {
    if (mode === 'standard') return standardCodes
    if (mode === 'wild') return expansions.map(e => e.code)
    return selectedCodes
  }, [mode, standardCodes, expansions, selectedCodes])

  const perExpansion = calculatorResults?.perExpansion ?? null

  const totals = useMemo(() => {
    if (!perExpansion) return null
    const active = perExpansion.filter(r => !r.alreadyComplete)
    return {
      packs: active.reduce((s, r) => s + r.mean, 0),
      min: active.reduce((s, r) => s + r.min, 0),
      max: active.reduce((s, r) => s + r.max, 0),
      dustGenerated: active.reduce((s, r) => s + r.avgDustGenerated, 0),
      dustSpentCrafting: active.reduce((s, r) => s + r.avgDustSpentCrafting, 0),
    }
  }, [perExpansion])

  function handleCalculate() {
    runCalculator(activeCodes, dust)
  }

  function toggleCode(code: string) {
    setSelectedCodes(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code],
    )
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-bold text-gold mb-6">Cost Calculator</h1>

      {/* Mode selector */}
      <div className="flex gap-2 mb-4">
        {(['standard', 'wild', 'custom'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-2 rounded text-sm transition-colors ${
              mode === m
                ? 'bg-gold/20 text-gold border border-gold/30'
                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
            }`}
          >
            {m === 'standard' ? 'Standard' : m === 'wild' ? 'All (Wild)' : 'Custom'}
          </button>
        ))}
      </div>

      {/* Custom expansion picker */}
      {mode === 'custom' && (
        <div className="mb-4 grid grid-cols-3 gap-1.5 max-h-48 overflow-auto p-3 bg-white/5 rounded border border-white/10">
          {expansions.map(exp => (
            <label key={exp.code} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white/5 px-2 py-1 rounded">
              <input
                type="checkbox"
                checked={selectedCodes.includes(exp.code)}
                onChange={() => toggleCode(exp.code)}
                className="accent-gold"
              />
              <span className={selectedCodes.includes(exp.code) ? 'text-white' : 'text-gray-400'}>
                {exp.name}
                {exp.standard && <span className="text-mana ml-1">(S)</span>}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Dust input */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm text-gray-400 flex items-center gap-1.5">
          <DustIcon size={16} />
          Current dust:
        </label>
        <input
          type="number"
          value={dust}
          onChange={e => setDust(parseInt(e.target.value) || 0)}
          className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm w-32
                     focus:outline-none focus:border-gold/50 text-mana font-medium"
        />
        <button
          onClick={handleCalculate}
          disabled={calculatorLoading || activeCodes.length === 0}
          className="px-6 py-2 bg-gold text-navy-dark font-bold rounded text-sm
                     hover:bg-gold-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {calculatorLoading ? 'Calculating...' : 'Calculate'}
        </button>
        <span className="text-xs text-gray-500">
          {activeCodes.length} expansion{activeCodes.length !== 1 ? 's' : ''} selected
        </span>
      </div>

      {/* Results */}
      {perExpansion && (
        <div className="space-y-6">
          {/* Per-expansion table */}
          <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-xs">
                  <th className="text-left px-4 py-3">Expansion</th>
                  <th className="text-right px-4 py-3">Avg Packs</th>
                  <th className="text-right px-4 py-3">Median</th>
                  <th className="text-right px-4 py-3">Best-Worst</th>
                  <th className="text-right px-4 py-3">Likely (25-75%)</th>
                  <th className="text-right px-4 py-3">Dust Earned</th>
                  <th className="text-right px-4 py-3">Dust Crafted</th>
                </tr>
              </thead>
              <tbody>
                {perExpansion.map(r => (
                  <tr key={r.expansion} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 text-white">{r.expansion}</td>
                    {r.alreadyComplete ? (
                      <td colSpan={6} className="px-4 py-3 text-green-400 text-right">Complete</td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-right text-gold font-medium">{r.mean}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{r.median}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{r.min}-{r.max}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{r.p25}-{r.p75}</td>
                        <td className="px-4 py-3 text-right text-mana">{Math.round(r.avgDustGenerated).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-orange-400">{Math.round(r.avgDustSpentCrafting).toLocaleString()}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          {totals && totals.packs > 0 && (
            <div className="bg-navy-light rounded-lg border border-gold/20 p-5">
              <h3 className="text-gold font-bold mb-3">Per-Set Pack Total</h3>
              <div className="grid grid-cols-6 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1.5">
                    <PackIcon size={20} />
                    <span className="text-2xl font-bold text-white">{totals.packs}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">packs (avg)</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1.5">
                    <GoldIcon size={20} />
                    <span className="text-2xl font-bold text-yellow-300">
                      {(totals.packs * 100).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">gold</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-400">
                    ${Math.round(totals.packs * 1.167).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">USD (est)</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-300">
                    {totals.min}-{totals.max}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">best-worst</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1.5">
                    <DustIcon size={20} />
                    <span className="text-2xl font-bold text-mana">
                      {Math.round(totals.dustGenerated).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">dust earned</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1.5">
                    <DustIcon size={20} />
                    <span className="text-2xl font-bold text-orange-400">
                      {Math.round(totals.dustSpentCrafting).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">dust crafted</div>
                </div>
              </div>
            </div>
          )}

          {/* Bar chart */}
          {perExpansion.some(r => !r.alreadyComplete) && (
            <div className="bg-white/5 rounded-lg border border-white/10 p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-3">Packs per Expansion</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={perExpansion.filter(r => !r.alreadyComplete)}>
                  <XAxis
                    dataKey="expansion"
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    angle={-30}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f0f1e',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      color: '#f5f5f5',
                      fontSize: '12px',
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: '#d4a843', fontWeight: 'bold', marginBottom: '4px' }}
                    itemStyle={{ color: '#f5f5f5' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="mean" name="Avg Packs" radius={[4, 4, 0, 0]}>
                    {perExpansion
                      .filter(r => !r.alreadyComplete)
                      .map((_, i) => (
                        <Cell key={i} fill={i % 2 === 0 ? '#d4a843' : '#a68932'} />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

        </div>
      )}
    </div>
  )
}