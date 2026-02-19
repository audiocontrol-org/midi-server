import { useMemo } from 'react'
import { PanOnScrollMode } from '@xyflow/react'

type OS = 'macos' | 'windows' | 'linux' | 'unknown'

interface GraphGestureSettings {
  /** Pan the view when scrolling (two-finger drag on trackpad) */
  panOnScroll: boolean
  /** Zoom when using scroll wheel (mouse wheel or trackpad scroll without pinch) */
  zoomOnScroll: boolean
  /** Zoom when pinching (trackpad pinch gesture) */
  zoomOnPinch: boolean
  /** Pan when clicking and dragging */
  panOnDrag: boolean
  /** Modifier key that enables panning while scrolling (when panOnScroll is false) */
  panOnScrollMode: PanOnScrollMode
}

/**
 * Detect the user's operating system
 */
function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'unknown'

  const platform = navigator.platform?.toLowerCase() ?? ''
  const userAgent = navigator.userAgent?.toLowerCase() ?? ''

  if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'macos'
  }
  if (platform.includes('win') || userAgent.includes('win')) {
    return 'windows'
  }
  if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux'
  }

  return 'unknown'
}

/**
 * Detect if the user likely has a trackpad
 * This is a heuristic - we assume macOS users have trackpads,
 * and check for touch support on other platforms
 */
function hasTrackpad(os: OS): boolean {
  if (os === 'macos') {
    // Most Mac users have trackpads (built-in or Magic Trackpad)
    return true
  }

  // For other platforms, check if touch events are supported
  // This is a rough heuristic for modern laptops with precision trackpads
  if (typeof window !== 'undefined') {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  }

  return false
}

/**
 * Get platform-appropriate gesture settings for React Flow graph navigation.
 *
 * Platform conventions:
 * - macOS: Two-finger scroll pans, pinch zooms (trackpad-centric)
 * - Windows/Linux with trackpad: Same as macOS
 * - Windows/Linux with mouse: Scroll wheel zooms (traditional behavior)
 *
 * This hook returns settings that align with the user's platform norms.
 */
export function useGraphGestures(): GraphGestureSettings {
  return useMemo(() => {
    const os = detectOS()
    const trackpad = hasTrackpad(os)

    if (trackpad) {
      // Trackpad users (macOS default, modern laptops):
      // - Two-finger scroll pans the view
      // - Pinch gesture zooms
      // - Click and drag pans
      return {
        panOnScroll: true,
        zoomOnScroll: false,
        zoomOnPinch: true,
        panOnDrag: true,
        panOnScrollMode: PanOnScrollMode.Free
      }
    }

    // Mouse users (traditional desktop):
    // - Scroll wheel zooms
    // - Click and drag pans
    // - No pinch support (no trackpad)
    return {
      panOnScroll: false,
      zoomOnScroll: true,
      zoomOnPinch: true,
      panOnDrag: true,
      panOnScrollMode: PanOnScrollMode.Free
    }
  }, [])
}

/**
 * Export OS detection for potential use elsewhere
 */
export { detectOS, type OS }
