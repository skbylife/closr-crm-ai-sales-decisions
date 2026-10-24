/** The browser flag is compiled at build time; the server flag is runtime configuration. */
export function isNativeDatabase(): boolean {
  return typeof window === 'undefined'
    ? (process.env.CLOSR_DATABASE_BACKEND ?? process.env.NEXT_PUBLIC_CLOSR_DATABASE_BACKEND) === 'postgres'
    : process.env.NEXT_PUBLIC_CLOSR_DATABASE_BACKEND === 'postgres';
}
