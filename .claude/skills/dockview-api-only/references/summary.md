This file is a merged representation of a subset of the codebase, containing specifically included files and files not matching ignore patterns, combined into a single document by Repomix.

# Summary

## Purpose

This is a reference codebase organized into multiple files for AI consumption.
It is designed to be easily searchable using grep and other text-based tools.

## File Structure

This skill contains the following reference files:

| File | Contents |
|------|----------|
| `project-structure.md` | Directory tree with line counts per file |
| `files.md` | All file contents (search with `## File: <path>`) |
| `tech-stack.md` | Languages, frameworks, and dependencies |
| `summary.md` | This file - purpose and format explanation |

## Usage Guidelines

- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes

- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: packages/dockview-core/src/index.ts, packages/dockview-core/src/api/**/*.ts, packages/dockview-core/src/dockview/types.ts, packages/dockview-core/src/dockview/options.ts, packages/dockview-core/src/dockview/framework.ts, packages/dockview/src/**/*.{ts,tsx}, packages/docs/docs/api/**/*.mdx, packages/dockview/package.json
- Files matching these patterns are excluded: **/__tests__/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

## Statistics

42 files | 4,143 lines

| Language | Files | Lines |
|----------|------:|------:|
| TypeScript | 22 | 2,968 |
| MDX | 13 | 183 |
| TypeScript (TSX) | 6 | 931 |
| JSON | 1 | 61 |

**Largest files:**
- `packages/dockview-core/src/api/component.api.ts` (940 lines)
- `packages/dockview/src/dockview/dockview.tsx` (328 lines)
- `packages/dockview-core/src/dockview/options.ts` (306 lines)
- `packages/dockview-core/src/api/dockviewPanelApi.ts` (237 lines)
- `packages/dockview/src/react.ts` (206 lines)
- `packages/dockview-core/src/api/panelApi.ts` (188 lines)
- `packages/dockview/src/paneview/paneview.tsx` (186 lines)
- `packages/dockview-core/src/api/dockviewGroupPanelApi.ts` (161 lines)
- `packages/dockview-core/src/index.ts` (150 lines)
- `packages/dockview/src/gridview/gridview.tsx` (136 lines)