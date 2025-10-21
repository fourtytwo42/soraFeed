'use client';

import React, { createContext, useContext, useCallback, useRef, useState } from 'react';

export type GestureDirection = 'vertical' | 'horizontal' | null;

interface GestureState {
  direction: GestureDirection;
  isActive: boolean;
  startX: number;
  startY: number;
  threshold: number;
}

interface GestureContextType {
  gestureState: GestureState;
  startGesture: (clientX: number, clientY: number, threshold?: number) => void;
  updateGesture: (clientX: number, clientY: number) => GestureDirection;
  endGesture: () => void;
  isGestureActive: (direction: GestureDirection) => boolean;
  shouldBlockGesture: (direction: GestureDirection) => boolean;
}

const GestureContext = createContext<GestureContextType | null>(null);

export function GestureProvider({ children }: { children: React.ReactNode }) {
  const [gestureState, setGestureState] = useState<GestureState>({
    direction: null,
    isActive: false,
    startX: 0,
    startY: 0,
    threshold: 15
  });

  const gestureRef = useRef<GestureState>(gestureState);
  gestureRef.current = gestureState;

  const startGesture = useCallback((clientX: number, clientY: number, threshold: number = 15) => {
    console.log('🎯 Starting gesture at:', { clientX, clientY, threshold });
    const newState: GestureState = {
      direction: null,
      isActive: true,
      startX: clientX,
      startY: clientY,
      threshold
    };
    setGestureState(newState);
    gestureRef.current = newState;
  }, []);

  const updateGesture = useCallback((clientX: number, clientY: number): GestureDirection => {
    const state = gestureRef.current;
    if (!state.isActive) return null;

    const deltaX = Math.abs(clientX - state.startX);
    const deltaY = Math.abs(clientY - state.startY);

    // Very forgiving thresholds - allow both directions for as long as possible
    const minMovement = state.threshold;
    const lockThreshold = state.threshold * 3; // Need 3x threshold to lock direction
    const dominanceRatio = 3.0; // One axis needs to be 3x larger to dominate

    // Only determine direction once we've moved significantly
    if (deltaX > minMovement || deltaY > minMovement) {
      let direction: GestureDirection = null;
      
      if (state.direction === null) {
        // Only lock direction if movement is significant AND one axis clearly dominates
        if (deltaX > lockThreshold || deltaY > lockThreshold) {
          if (deltaX > deltaY * dominanceRatio) {
            direction = 'horizontal';
            console.log('🔄 Gesture direction locked: HORIZONTAL', { deltaX, deltaY, ratio: deltaX/deltaY });
          } else if (deltaY > deltaX * dominanceRatio) {
            direction = 'vertical';
            console.log('🔄 Gesture direction locked: VERTICAL', { deltaX, deltaY, ratio: deltaY/deltaX });
          }
          // If neither axis dominates clearly, stay unlocked (allow both)
        }
        
        if (direction) {
          const newState = { ...state, direction };
          setGestureState(newState);
          gestureRef.current = newState;
        }
      } else {
        direction = state.direction;
      }
      
      return direction;
    }

    return state.direction;
  }, []);

  const endGesture = useCallback(() => {
    console.log('🏁 Ending gesture');
    const newState: GestureState = {
      direction: null,
      isActive: false,
      startX: 0,
      startY: 0,
      threshold: 15
    };
    setGestureState(newState);
    gestureRef.current = newState;
  }, []);

  const isGestureActive = useCallback((direction: GestureDirection): boolean => {
    const state = gestureRef.current;
    return state.isActive && (state.direction === direction || state.direction === null);
  }, []);

  const shouldBlockGesture = useCallback((direction: GestureDirection): boolean => {
    const state = gestureRef.current;
    // Only block if gesture is active AND direction is locked AND it's different
    // This allows both directions when no clear direction has been determined
    const shouldBlock = state.isActive && state.direction !== null && state.direction !== direction;
    if (shouldBlock) {
      console.log('🚫 Blocking gesture:', { requestedDirection: direction, lockedDirection: state.direction });
    } else if (state.isActive && state.direction === null) {
      console.log('✅ Allowing gesture (no direction locked):', { requestedDirection: direction });
    }
    return shouldBlock;
  }, []);

  return (
    <GestureContext.Provider value={{
      gestureState,
      startGesture,
      updateGesture,
      endGesture,
      isGestureActive,
      shouldBlockGesture
    }}>
      {children}
    </GestureContext.Provider>
  );
}

export function useGestureContext() {
  const context = useContext(GestureContext);
  if (!context) {
    throw new Error('useGestureContext must be used within a GestureProvider');
  }
  return context;
}
