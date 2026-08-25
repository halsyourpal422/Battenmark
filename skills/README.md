# Battenmark CAD Skills

Portable, versioned instruction packs that teach any capable external agent how to perform recurring CAD work through Battenmark's public typed operations.

Skills are **not** plugins, runtimes, or parallel APIs. The sole executable authority remains the Battenmark schema / tool registry.

## Quick start for agents

1. Read the skill that matches your intent.
2. Discover the live tool surface if optional operations may be missing.
3. Follow the recommended sequence, preferring **REQUIRED** steps.
4. Hit every **Verification gate** before export.
5. On failure, follow recovery guidance; never bypass the public service layer.

## Directory layout

```text
skills/
  README.md
  _template/                # not a runnable skill
  basic-part/
  enclosure/
  assembly/
  fdm-dfm/
  backend-diagnostics/
```

Each skill: `SKILL.md` + `skill.json`.

## Authoring

1. Copy `skills/_template/`.
2. Kebab-case `id` matching directory.
3. Fill `skill.json` (operations must exist in live TOOL_NAMES).
4. Write required SKILL.md sections.
5. `npm run skills:validate`.

Required sections: Purpose, Use when, Do not use when, Preconditions, Planning rules, Recommended operation sequence, Geometry / mechanical rules, Verification gates, Failure recovery, Outputs, Platform notes, Examples.

## Validation

```bash
npm run skills:validate
npm run skills:validate:test
```

## Security

Public operations only. No automatic execution, no dependency installs, no private FreeCAD/worker internals, no secrets. Verification gates required.

Full policy: docs/architecture/PHASE_7B_SKILLS_ARCHITECTURE.md
