/**
 * Simple global container reference utility for DI access outside of DI-managed code.
 *
 * Why:
 * - Decorators and framework utilities are not instantiated by the DI container,
 *   so they cannot receive injected dependencies directly.
 * - This module provides a safe, minimal bridge to read the current container.
 *
 * Usage:
 *   // During framework bootstrap (once)
 *   ContainerRef.set(container)
 *
 *   // Anywhere (decorators/helpers)
 *   const container = ContainerRef.get()
 *
 *   // Temporarily override (e.g., in tests)
 *   await ContainerRef.runWith(otherContainer, () => doSomething())
 */

import type { DependencyContainer } from 'tsyringe';

let currentContainer: DependencyContainer | null = null;

export const ContainerRef = {
  /**
   * Set the current global DI container reference.
   * Should be called once during application bootstrap.
   */
  set(container: DependencyContainer): void {
    if (!container) {
      throw new Error('ContainerRef.set() received an invalid container instance');
    }
    // Patch container.resolve to forbid resolving unregistered tokens
    const anyContainer = container as unknown as {
      resolve: (token: unknown) => unknown;
      isRegistered: (token: unknown, recursive?: boolean) => boolean;
      __tsuki_patched_resolve?: boolean;
      __tsuki_original_resolve?: (token: unknown) => unknown;
    };
    if (!anyContainer.__tsuki_patched_resolve) {
      const originalResolve = anyContainer.resolve.bind(anyContainer);
      anyContainer.__tsuki_original_resolve = originalResolve;
      anyContainer.resolve = (token: unknown) => {
        // Only enforce for constructor or explicit tokens; allow internal symbols
        const isRegistered = anyContainer.isRegistered(token as any, true);
        if (!isRegistered) {
          const fn = token as { name?: string; toString: () => string };
          const name =
            typeof token === 'function'
              ? fn.name && fn.name.length > 0
                ? fn.name
                : fn.toString()
              : String(token ?? 'AnonymousToken');
          throw new ReferenceError(
            `Cannot resolve unregistered token ${name}. Ensure it is provided in a Module.providers or its module is imported, and avoid type-only imports.`,
          );
        }
        return originalResolve(token);
      };
      anyContainer.__tsuki_patched_resolve = true;
    }
    currentContainer = container;
  },

  /**
   * Get the current global DI container.
   * Throws if the container is not initialized.
   */
  get(): DependencyContainer {
    if (!currentContainer) {
      throw new Error(
        'DI container has not been set. Ensure the application bootstrap assigns the container via ContainerRef.set(container).',
      );
    }
    return currentContainer;
  },

  /**
   * Check whether a container has been set.
   */
  has(): boolean {
    return currentContainer !== null;
  },

  /**
   * Reset the container reference (primarily for testing).
   */
  reset(): void {
    currentContainer = null;
  },

  /**
   * Temporarily set the container for the duration of the provided function.
   * Restores the previous container when the function completes or throws.
   */
  async runWith<T>(container: DependencyContainer, fn: () => Promise<T> | T): Promise<T> {
    const previous = currentContainer;
    currentContainer = container;
    try {
      return await Promise.resolve(fn());
    } finally {
      currentContainer = previous;
    }
  },
};

/**
 * Convenience helpers if you prefer function-style APIs.
 */
export function setContainerRef(container: DependencyContainer): void {
  ContainerRef.set(container);
}

export function getContainerRef(): DependencyContainer {
  return ContainerRef.get();
}

export function hasContainerRef(): boolean {
  return ContainerRef.has();
}

export function resetContainerRef(): void {
  ContainerRef.reset();
}

export async function runWithContainer<T>(
  container: DependencyContainer,
  fn: () => Promise<T> | T,
): Promise<T> {
  return ContainerRef.runWith(container, fn);
}
