# DESIGN Baseline

This desktop app follows a workspace-first UI baseline inspired by awesome-design-md, adapted to the existing Prompt Studio workflows.

## Core Layout
- Left navigation rail: project context and content sections.
- Center workspace: searchable/filterable card collection.
- Right inspector panel: metadata, prompt body, reverse-analysis summary, and primary actions.
- Bottom batch bar: multi-select actions for cards.

## Information Architecture
- Projects: project cards + project detail inspector.
- Assets: unified asset view across image/video/skills within a project.
- Image prompts: card library + inspector + reverse-analysis sections.
- Video prompts: card library + inspector + reverse-analysis sections.
- Skills prompts: card library + inspector + markdown-focused details.
- Desktop settings: grouped sections for reverse config, default instructions, preset library, and operations.

## Interaction Patterns
- Single click selects a card and updates inspector.
- Double click opens editor.
- Toolbar supports filtering, sorting, and view mode switching.
- Batch selection shows bottom action bar.

## Constraints
- Do not clone reference colors.
- Preserve existing data model and API endpoints.
- Keep current create/edit/save/delete/reverse flows functional.
