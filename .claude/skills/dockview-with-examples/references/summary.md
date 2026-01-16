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
- Only files matching these patterns are included: packages/dockview-core/src/**/*.ts, packages/dockview/src/**/*.{ts,tsx}, packages/docs/docs/**/*.mdx, packages/docs/sandboxes/react/dockview/**/src/*.tsx, packages/docs/sandboxes/dockview-app/src/*.tsx, packages/dockview/package.json, packages/dockview-core/package.json, README.md
- Files matching these patterns are excluded: **/__tests__/**, **/scripts/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

## Statistics

191 files | 26,925 lines

| Language | Files | Lines |
|----------|------:|------:|
| TypeScript | 84 | 19,303 |
| MDX | 53 | 2,272 |
| TypeScript (TSX) | 51 | 5,196 |
| JSON | 2 | 116 |
| Markdown | 1 | 38 |

**Largest files:**
- `packages/dockview-core/src/dockview/dockviewComponent.ts` (2,900 lines)
- `packages/dockview-core/src/splitview/splitview.ts` (1,174 lines)
- `packages/dockview-core/src/gridview/gridview.ts` (1,132 lines)
- `packages/dockview-core/src/dockview/dockviewGroupPanelModel.ts` (1,108 lines)
- `packages/dockview-core/src/api/component.api.ts` (940 lines)
- `packages/dockview-core/src/dnd/droptarget.ts` (690 lines)
- `packages/dockview-core/src/overlay/overlay.ts` (646 lines)
- `packages/docs/sandboxes/react/dockview/demo-dockview/src/app.tsx` (541 lines)
- `packages/dockview-core/src/paneview/paneviewComponent.ts` (502 lines)
- `packages/dockview-core/src/dom.ts` (500 lines)