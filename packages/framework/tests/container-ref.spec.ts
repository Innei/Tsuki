import 'reflect-metadata'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  ContainerRef,
  getContainerRef,
  hasContainerRef,
  resetContainerRef,
  runWithContainer,
  setContainerRef,
} from '../src/utils/container-ref'

type TestContainer = {
  registrations: Map<unknown, () => unknown>
  resolve: (token: unknown) => unknown
  isRegistered: (token: unknown, recursive?: boolean) => boolean
}

function createTestContainer(): TestContainer {
  const registrations = new Map<unknown, () => unknown>()
  return {
    registrations,
    resolve(token: unknown) {
      const resolver = registrations.get(token)
      if (!resolver) {
        throw new Error(`original resolve invoked for ${String(token)}`)
      }
      return resolver()
    },
    isRegistered(token: unknown) {
      return registrations.has(token)
    },
  }
}

describe('ContainerRef utility', () => {
  beforeEach(() => {
    resetContainerRef()
  })

  it('throws when setting an invalid container reference', () => {
    expect(() => ContainerRef.set(undefined as any)).toThrow(/invalid container instance/i)
    expect(() => setContainerRef(null as any)).toThrow(/invalid container instance/i)
  })

  it('tracks container state and patches resolve to guard against unknown tokens', async () => {
    const VALUE_TOKEN = Symbol('value-token')
    const container = createTestContainer()
    container.registrations.set(VALUE_TOKEN, () => ({ value: 'ok' }))

    ContainerRef.set(container as any)

    expect(hasContainerRef()).toBe(true)
    expect(ContainerRef.has()).toBe(true)
    expect(getContainerRef()).toBe(container)

    const resolved = container.resolve(VALUE_TOKEN)
    expect(resolved).toEqual({ value: 'ok' })

    expect(() => container.resolve(Symbol('missing'))).toThrowError(/Cannot resolve unregistered token/)

    const other = createTestContainer()
    other.registrations.set('x', () => 'other')

    const result = await runWithContainer(other as any, () => {
      expect(getContainerRef()).toBe(other)
      return other.resolve('x')
    })

    expect(result).toBe('other')

    // Original container restored after runWith
    expect(getContainerRef()).toBe(container)

    resetContainerRef()
    expect(ContainerRef.has()).toBe(false)
  })

  it('includes non-constructor token names in unregistered token errors', () => {
    const container = createTestContainer()
    ContainerRef.set(container as any)

    expect(() => container.resolve('string-token')).toThrowError(/Cannot resolve unregistered token string-token/)

    resetContainerRef()
  })

  it('falls back to AnonymousToken label when resolving undefined tokens', () => {
    const container = createTestContainer()
    ContainerRef.set(container as any)

    expect(() => container.resolve(undefined as any)).toThrowError(/Cannot resolve unregistered token AnonymousToken/)

    resetContainerRef()
  })
})
