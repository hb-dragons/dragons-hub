// Intentionally left empty — strict message typing is handled by
// the message-completeness test rather than the TypeScript compiler.
// Flat-key ICU MessageFormat strings (e.g. "{count} created") cannot
// have their interpolation parameters statically inferred, so we
// skip the AppConfig.Messages declaration to avoid false TS errors.
export {};
