// Type declarations for the JSDoc type check (npm run typecheck). Not shipped.

interface Window {
  // The running collect() of the first injection into this page, reused by later ones.
  __dropcheck?: Promise<Record<string, any>>;
}
