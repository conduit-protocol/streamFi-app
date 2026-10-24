/**
 * Explicit PostCSS pipeline for Tailwind.
 *
 * Next.js can infer a default Tailwind/autoprefixer PostCSS config when none
 * is present, but that default has changed across Next major versions and is
 * undocumented behavior to depend on — the exact failure mode reported here
 * (utility classes, including flex/flexbox ones, silently not applied in a
 * production build while looking fine in dev) is what happens when the
 * PostCSS plugin chain that runs @tailwind directives isn't wired up the
 * same way for both. Declaring it in CommonJS format (rather than .mjs)
 * removes that ambiguity across all Next.js versions (fixes #192).
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
