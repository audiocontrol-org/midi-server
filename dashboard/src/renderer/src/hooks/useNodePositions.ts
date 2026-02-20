import { useState, useCallback, useEffect, useRef } from 'react'

const STORAGE_KEY = 'midi-route-graph-positions'
const DEBOUNCE_MS = 500

interface Position {
  x: number
  y: number
}

interface UseNodePositionsReturn {
  positions: Map<string, Position>
  updatePosition: (nodeId: string, position: Position) => void
  updatePositions: (positions: Map<string, Position>) => void
}

function loadPositions(): Map<string, Position> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, Position>
      return new Map(Object.entries(parsed))
    }
  } catch (err) {
    console.error('Failed to load node positions from localStorage:', err)
  }
  return new Map()
}

function savePositions(positions: Map<string, Position>): void {
  try {
    const obj: Record<string, Position> = {}
    positions.forEach((pos, id) => {
      obj[id] = pos
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch (err) {
    console.error('Failed to save node positions to localStorage:', err)
  }
}

export function useNodePositions(): UseNodePositionsReturn {
  const [positions, setPositions] = useState<Map<string, Position>>(loadPositions)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced save to localStorage
  const scheduleSave = useCallback((newPositions: Map<string, Position>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      savePositions(newPositions)
    }, DEBOUNCE_MS)
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const updatePosition = useCallback(
    (nodeId: string, position: Position) => {
      setPositions((prev) => {
        const next = new Map(prev)
        next.set(nodeId, position)
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave]
  )

  const updatePositions = useCallback(
    (newPositions: Map<string, Position>) => {
      setPositions((prev) => {
        const merged = new Map(prev)
        newPositions.forEach((pos, id) => {
          merged.set(id, pos)
        })
        scheduleSave(merged)
        return merged
      })
    },
    [scheduleSave]
  )

  return { positions, updatePosition, updatePositions }
}
