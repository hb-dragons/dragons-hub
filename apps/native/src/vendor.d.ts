declare module "@ungap/structured-clone" {
  const structuredClone: <T>(value: T, options?: { lossy?: boolean }) => T;
  export default structuredClone;
}
