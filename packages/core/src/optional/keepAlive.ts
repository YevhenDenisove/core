import { Component, ComponentClass, MountedComponent } from '../component'
import { VNode, Slots } from '../vdom'
import { VNodeFlags } from '../flags'

type MatchPattern = string | RegExp | string[] | RegExp[]

interface KeepAliveProps {
  include?: MatchPattern
  exclude?: MatchPattern
  max?: number | string
}

type CacheKey = string | number | ComponentClass
type Cache = Map<CacheKey, VNode>

export const KeepAliveSymbol = Symbol()

export class KeepAlive extends Component<{}, KeepAliveProps> {
  cache: Cache
  keys: Set<CacheKey>

  // to be set in createRenderer when instance is created
  $unmount: (instance: MountedComponent) => void

  created() {
    this.cache = new Map()
    // keys represents the "freshness" of cached components
    // oldest cached ones will be pruned first when cache count exceeds max
    this.keys = new Set()
  }

  unmounted() {
    this.cache.forEach(vnode => {
      // change flag so it can be properly unmounted
      vnode.flags = VNodeFlags.COMPONENT_STATEFUL_NORMAL
      this.$unmount(vnode.children as MountedComponent)
    })
  }

  pruneCache(filter?: (name: string) => boolean) {
    this.cache.forEach((vnode, key) => {
      const name = getName(vnode.tag as ComponentClass)
      if (name && (!filter || !filter(name))) {
        this.pruneCacheEntry(key)
      }
    })
  }

  pruneCacheEntry(key: CacheKey) {
    const cached = this.cache.get(key) as VNode
    const current = this.$vnode
    if (!current || cached.tag !== current.tag) {
      this.$unmount(cached.children as MountedComponent)
    }
    this.cache.delete(key)
    this.keys.delete(key)
  }

  render(props: any, slots: Slots) {
    if (!slots.default) {
      return
    }
    const children = slots.default()
    let vnode = children[0]
    if (children.length > 1) {
      if (__DEV__) {
        console.warn(`KeepAlive can only have a single child.`)
      }
      return children
    } else if ((vnode.flags & VNodeFlags.COMPONENT_STATEFUL) === 0) {
      if (__DEV__) {
        console.warn(`KeepAlive child must be a stateful component.`)
      }
      return children
    }

    const comp = vnode.tag as ComponentClass
    const name = getName(comp)
    const { include, exclude, max } = props

    if (
      (include && (!name || !matches(include, name))) ||
      (exclude && name && matches(exclude, name))
    ) {
      return vnode
    }

    const { cache, keys } = this
    const key = vnode.key == null ? comp : vnode.key
    const cached = cache.get(key)
    if (cached) {
      vnode.children = cached.children
      vnode.el = cached.el
      vnode.flags |= VNodeFlags.COMPONENT_STATEFUL_KEPT_ALIVE
      // make this key the freshest
      keys.delete(key)
      keys.add(key)
    } else {
      cache.set(key, vnode)
      keys.add(key)
      // prune oldest entry
      if (max && keys.size > parseInt(max, 10)) {
        this.pruneCacheEntry(Array.from(this.keys)[0])
      }
    }
    vnode.flags |= VNodeFlags.COMPONENT_STATEFUL_SHOULD_KEEP_ALIVE
    return vnode
  }
}

// mark constructor
// we use a symbol instead of comparing to the constructor itself
// so that the implementation can be tree-shaken
;(KeepAlive as any)[KeepAliveSymbol] = true

function getName(comp: ComponentClass): string | void {
  return comp.options && comp.options.name
}

function matches(pattern: MatchPattern, name: string): boolean {
  if (Array.isArray(pattern)) {
    return (pattern as any).some((p: string | RegExp) => matches(p, name))
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (pattern.test) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}
