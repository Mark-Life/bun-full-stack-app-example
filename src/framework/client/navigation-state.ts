/**
 * Navigation state management for client-side routing
 * Provides a simple pub/sub store for navigation state
 */

import { useEffect, useState } from "react";

/**
 * Navigation state interface
 */
export interface NavigationState {
  currentPath: string;
  currentParams: Record<string, string>;
  isNavigating: boolean;
  pendingPath: string | null;
  error: Error | null;
}

/**
 * Listener function type for navigation state changes
 */
type NavigationStateListener = (state: NavigationState) => void;

/**
 * Navigation store implementation
 */
class NavigationStore {
  private state: NavigationState = {
    currentPath: typeof window !== "undefined" ? window.location.pathname : "/",
    currentParams: {},
    isNavigating: false,
    pendingPath: null,
    error: null,
  };

  private readonly listeners = new Set<NavigationStateListener>();

  /**
   * Get current navigation state
   */
  getState(): NavigationState {
    return { ...this.state };
  }

  /**
   * Update navigation state and notify listeners
   */
  setState(updates: Partial<NavigationState>): void {
    this.state = { ...this.state, ...updates };
    const currentState = this.getState();
    for (const listener of this.listeners) {
      listener(currentState);
    }
  }

  /**
   * Subscribe to navigation state changes
   * Returns unsubscribe function
   */
  subscribe(listener: NavigationStateListener): () => void {
    this.listeners.add(listener);
    // Immediately call listener with current state
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/**
 * Global navigation store instance
 */
const navigationStore = new NavigationStore();

/**
 * Hook to access navigation state
 * Automatically subscribes and unsubscribes on mount/unmount
 */
export const useNavigationState = (): NavigationState => {
  const [state, setState] = useState<NavigationState>(() =>
    navigationStore.getState()
  );

  useEffect(() => {
    const unsubscribe = navigationStore.subscribe(setState);
    return unsubscribe;
  }, []);

  return state;
};

/**
 * Get navigation store instance (for use outside React components)
 */
export const getNavigationStore = (): NavigationStore => navigationStore;
