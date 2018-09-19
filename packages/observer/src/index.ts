import { mutableHandlers, immutableHandlers } from './baseHandlers'

import {
  mutableCollectionHandlers,
  immutableCollectionHandlers
} from './collectionHandlers'

import {
  targetMap,
  observedToRaw,
  rawToObserved,
  immutableToRaw,
  rawToImmutable,
  immutableValues,
  nonReactiveValues
} from './state'

import {
  createAutorun,
  cleanup,
  Autorun,
  AutorunOptions,
  DebuggerEvent
} from './autorun'

export { Autorun, DebuggerEvent }
export { OperationTypes } from './operations'
export { computed, ComputedGetter } from './computed'
export { lock, unlock } from './lock'

const EMPTY_OBJ = {}
const collectionTypes: Set<any> = new Set([Set, Map, WeakMap, WeakSet])
const observableValueRE = /^\[object (?:Object|Array|Map|Set|WeakMap|WeakSet)\]$/

const canObserve = (value: any): boolean => {
  return (
    !value._isVue &&
    !value._isVNode &&
    observableValueRE.test(Object.prototype.toString.call(value)) &&
    !nonReactiveValues.has(value)
  )
}

type identity = <T>(target?: T) => T

export const observable = ((target: any = {}): any => {
  // if trying to observe an immutable proxy, return the immutable version.
  if (immutableToRaw.has(target)) {
    return target
  }
  // target is explicitly marked as immutable by user
  if (immutableValues.has(target)) {
    return immutable(target)
  }
  return createObservable(
    target,
    rawToObserved,
    observedToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}) as identity

export const immutable = ((target: any = {}): any => {
  // value is a mutable observable, retrive its original and return
  // a readonly version.
  if (observedToRaw.has(target)) {
    target = observedToRaw.get(target)
  }
  return createObservable(
    target,
    rawToImmutable,
    immutableToRaw,
    immutableHandlers,
    immutableCollectionHandlers
  )
}) as identity

function createObservable(
  target: any,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  if ((__DEV__ && target === null) || typeof target !== 'object') {
    throw new Error(`value is not observable: ${String(target)}`)
  }
  // target already has corresponding Proxy
  let observed = toProxy.get(target)
  if (observed !== void 0) {
    return observed
  }
  // target is already a Proxy
  if (toRaw.has(target)) {
    return target
  }
  // only a whitelist of value types can be observed.
  if (!canObserve(target)) {
    return target
  }
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
  observed = new Proxy(target, handlers)
  toProxy.set(target, observed)
  toRaw.set(observed, target)
  targetMap.set(target, new Map())
  return observed
}

export function autorun(
  fn: Function,
  options: AutorunOptions = EMPTY_OBJ
): Autorun {
  if ((fn as Autorun).isAutorun) {
    fn = (fn as Autorun).raw
  }
  const runner = createAutorun(fn, options)
  if (!options.lazy) {
    runner()
  }
  return runner
}

export function stop(runner: Autorun) {
  if (runner.active) {
    cleanup(runner)
    runner.active = false
  }
}

export function isObservable(value: any): boolean {
  return observedToRaw.has(value) || immutableToRaw.has(value)
}

export function isImmutable(value: any): boolean {
  return immutableToRaw.has(value)
}

export function unwrap<T>(observed: T): T {
  return observedToRaw.get(observed) || immutableToRaw.get(observed) || observed
}

export function markImmutable<T>(value: T): T {
  immutableValues.add(value)
  return value
}

export function markNonReactive<T>(value: T): T {
  nonReactiveValues.add(value)
  return value
}
