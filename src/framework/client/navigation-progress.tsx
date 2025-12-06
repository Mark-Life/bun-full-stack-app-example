/**
 * Navigation progress indicator for client-side routing
 * Shows a thin progress bar at the top of the viewport during navigation
 */

import { useEffect, useState } from "react";
import { useNavigationState } from "./navigation-state";

/**
 * Hook to access navigation progress state
 * Wraps useNavigationState for convenience
 */
export const useNavigationProgress = () => {
  const { isNavigating, pendingPath } = useNavigationState();
  return { isLoading: isNavigating, targetPath: pendingPath };
};

/**
 * Navigation progress bar component
 * Thin bar at top of viewport (YouTube/GitHub style)
 * Auto-shows when navigation is in progress
 */
export const NavigationProgress = () => {
  const { isLoading } = useNavigationProgress();
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isLoading) {
      // Show progress bar immediately
      setIsVisible(true);
      setProgress(0);

      // Simulate progress (optimistic progress bar)
      // Start at 10% immediately
      setProgress(10);

      // Progress to 70% over 500ms
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev < 70) {
            return prev + 10;
          }
          return prev;
        });
      }, 100);

      // Cleanup interval after 500ms
      const cleanupTimeout = setTimeout(() => {
        clearInterval(progressInterval);
      }, 500);

      return () => {
        clearInterval(progressInterval);
        clearTimeout(cleanupTimeout);
      };
    } else {
      // Complete progress and hide
      setProgress(100);
      const hideTimeout = setTimeout(() => {
        setIsVisible(false);
        setProgress(0);
      }, 200);

      return () => {
        clearTimeout(hideTimeout);
      };
    }
  }, [isLoading]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          backgroundColor: "var(--navigation-progress-color, hsl(var(--primary)))",
          transition: progress === 100 ? "width 0.2s ease-out" : "width 0.1s linear",
          boxShadow: "0 0 10px var(--navigation-progress-color, hsl(var(--primary)))",
        }}
      />
    </div>
  );
};

