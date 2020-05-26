import { useEffect } from 'react'
import { ReactCurrentDispatcher } from './use-between/react-shared-internals'
import { useForceUpdate } from './use-between/use-force-update'

type Hook<T> = () => T

const stores = new Map<any, any>()

const equals = (a: any, b: any) => Object.is(a, b);

const factory = (hook: any) => {
  const boxes = [] as any[]
  let subscribers = [] as any[]
  let state = undefined as any

  const sync = () => {
    subscribers.slice().forEach(fn => fn())
  }

  const tick = () => {
    const origin = ReactCurrentDispatcher.current
    const current = Object.create(origin as object)

    let pointer = 0
    let tickAgain = false
    let tickBody = true
    const useEffectQueue = [] as any[]

    const nextTick = () => {
      if (tickBody) {
        tickAgain = true
      } else {
        tick()
      }
    }

    const next = () => {
      const index = pointer ++
      return (boxes[index] = boxes[index] || {})
    }

    current.useState = (initialState?: any) => {
      const box = next()

      if (!box.initialized) {
        box.state = typeof initialState === "function" ? initialState() : initialState

        box.set = (fn: any) => {
          if (typeof fn === 'function') {
            return box.set(fn(box.state))
          }
          if (!equals(fn, box.state)) {
            box.state = fn
            nextTick()
          }
        }
        box.initialized = true
      }

      return [ box.state, box.set ]
    }

    current.useEffect = (fn: any, deps: any[]) => {
      const box = next()

      if (!box.initialized) {
        box.deps = deps
        box.initialized = true
      }
      else {
        if (
          box.deps.length !== deps.length ||
          box.deps.some((dep: any, index: any) => !equals(dep, deps[index]))
        ) {
          useEffectQueue.push(() => {
            box.deps = deps
            fn()
          })
        }
      }
    }

    current.useReducer = (reducer: any, initialState?: any, init?: any) => {
      const box = next()

      if (!box.initialized) {
        box.state = init ? init(initialState) : initialState

        box.dispatch = (action: any) => {
          const state = reducer(box.state, action)
          if (!equals(state, box.state)) {
            box.state = state
            nextTick()
          }
        }
        box.initialized = true
      }

      return [ box.state, box.dispatch ]
    }

    ReactCurrentDispatcher.current = current
    state = hook()
    ReactCurrentDispatcher.current = origin

    useEffectQueue.forEach(fn => fn())

    tickBody = false
    if (!tickAgain) {
      sync()
      return
    }
    tick()
  }

  const subscribe = (fn: any) => {
    subscribers.push(fn)
    return () => {
      subscribers = subscribers.filter(f => f !== fn)
    }
  }

  const get = () => state
  const start = () => tick()

  return {
    subscribe,
    get,
    start
  }
}

export const useBetween = <T>(hook: Hook<T>): T => {
  const forceUpdate = useForceUpdate()
  let store = stores.get(hook)
  if (!store) {
    store = factory(hook)
    stores.set(hook, store)
    store.start()
  }
  useEffect(() => store.subscribe(forceUpdate), [store])
  return store.get()
}
