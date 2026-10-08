/**
 * Vite's client types are attached here instead of in `tsconfig.json`'s `types`
 * array on purpose: that array forces every compilation unit in the project to
 * load the package, including the Vercel function build, whose sandbox cannot
 * resolve it (TS2688 there broke all four `api/` endpoints). This file lives in
 * the browser graph only.
 */
/// <reference types="vite/client" />
