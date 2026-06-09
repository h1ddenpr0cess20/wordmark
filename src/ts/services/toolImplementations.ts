/**
 * Shared registry of client-side tool implementations, keyed by tool name.
 * Tool modules (memory, mediaTools, …) register their handlers here at load
 * time; the request client looks handlers up by name when dispatching calls.
 */
export const toolImplementations: Record<string, (...args: any[]) => any> = {};
