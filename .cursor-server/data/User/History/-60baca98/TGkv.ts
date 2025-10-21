import { useCallback, useRef, useState } from 'react';

export type GestureDirection = 'vertical' | 'horizontal' | null;

interface GestureState {
  direction: GestureDirection;
  isActive: boolean;
  startX: number;
  startY: number;
  threshold: number;
}

export function useGestureRails(threshold: number = 15) {
  const [gestureState, setGestureState] = useState<GestureState>({
    direction: null,
    isActive: false,
    startX: 0,
    startY: 0,
    threshold
  });

  const gestureRef = useRef<GestureState>(gestureState);
  gestureRef.current = gestureState;

  const startGesture = useCallback((clientX: number, clientY: number) => {
    const newState: GestureState = {
      direction: null,
      isActive: true,
      startX: clientX,
      startY: clientY,
      threshold
    };
    setGestureState(newState);
    gestureRef.current = newState;
  }, [threshold]);

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
        } else if (deltaY > deltaX) {
          direction = 'vertical';
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
    const newState: GestureState = {
      direction: null,
      isActive: false,
      startX: 0,
      startY: 0,
      threshold
    };
    setGestureState(newState);
    gestureRef.current = newState;
  }, [threshold]);

  const isGestureActive = useCallback((direction: GestureDirection): boolean => {
    const state = gestureRef.current;
    return state.isActive && (state.direction === direction || state.direction === null);
  }, []);

  const shouldBlockGesture = useCallback((direction: GestureDirection): boolean => {
    const state = gestureRef.current;
    return state.isActive && state.direction !== null && state.direction !== direction;
  }, []);

  return {
    gestureState,
    startGesture,
    updateGesture,
    endGesture,
    isGestureActive,
    shouldBlockGesture
  };
}
