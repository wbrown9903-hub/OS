/**
 * The single place the web app reaches into the widget catalogue package.
 *
 * It is imported by path rather than by package name because the repository's
 * TypeScript path aliases do not yet include `@nexus/widgets`; keeping the path in
 * one file means adding the alias later is a one-line change.
 */
export * from "../../../../packages/widgets/src/index.js";
