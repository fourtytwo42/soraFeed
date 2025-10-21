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

    // Only determine direction once we've moved past the threshold
    if (deltaX > state.threshold || deltaY > state.threshold) {
      let direction: GestureDirection = null;
      
      if (state.direction === null) {
        // Determine initial direction based on which axis has more movement
        if (deltaX > deltaY) {
          direction = 'horizontal';
          console.log('🔄 Gesture direction determined: HORIZONTAL', { deltaX, deltaY });
        } else if (deltaY > deltaX) {
          direction = 'vertical';
          console.log('🔄 Gesture direction determined: VERTICAL', { deltaX, deltaY });
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
    const shouldBlock = state.isActive && state.direction !== null && state.direction !== direction;
    if (shouldBlock) {
      console.log('🚫 Blocking gesture:', { requestedDirection: direction, activeDirection: state.direction });
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
