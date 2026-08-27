// Rejection fixtures for skill validation tests
// Each file represents a skill that SHOULD fail validation

// --- Fixture 1: Missing required section in SKILL.md ---
// skills/failure-missing-section/skill.json
{
  "id": "failure-missing-section",
  "title": "Missing Section Fixture",
  "format": 1,
  "version": 1,
  "description": "This skill is missing required SKILL.md sections.",
  "category": "modeling",
  "risk_level": "LOW",
  "capabilities": ["modeling"],
  "operations": ["create_box"],
  "references": [],
  "last_verified_schema": 2,
  "provenance": {
    "source": "internal",
    "maintainer": "battenmark-team"
  },
  "tags": ["test", "fixture"]
}

// skills/failure-missing-section/SKILL.md
// Missing: ## Purpose, ## Use when, ## Preconditions, etc.

// --- Fixture 2: Unknown operation in skill.json ---
// skills/failure-bad-operation/skill.json
{
  "id": "failure-bad-operation",
  "title": "Bad Operation Fixture",
  "format": 1,
  "version": 1,
  "description": "This skill uses an operation not in TOOL_CATALOG.",
  "category": "modeling",
  "risk_level": "LOW",
  "capabilities": ["modeling"],
  "operations": ["create_magic_widget", "inspect_part"],
  "references": [],
  "last_verified_schema": 2,
  "provenance": {
    "source": "internal",
    "maintainer": "battenmark-team"
  },
  "tags": ["test", "fixture"]
}

// --- Fixture 3: Duplicate ID ---
// skills/failure-duplicate-id/skill.json
{
  "id": "basic-part",
  "title": "Duplicate ID Fixture",
  "format": 1,
  "version": 1,
  "description": "This skill has an ID that matches basic-part.",
  "category": "modeling",
  "risk_level": "LOW",
  "capabilities": ["modeling"],
  "operations": ["create_box"],
  "references": [],
  "last_verified_schema": 2,
  "provenance": {
    "source": "internal",
    "maintainer": "battenmark-team"
  },
  "tags": ["test", "fixture"]
}

// --- Fixture 4: Malformed JSON ---
// skills/failure-malformed-json/skill.json
// { "id": "failure-malformed-json", "title": "Malformed Fixture", "format": 1 }

// --- Fixture 5: Wrong schema version ---
// skills/failure-wrong-schema/skill.json
{
  "id": "failure-wrong-schema",
  "title": "Wrong Schema Version Fixture",
  "format": 1,
  "version": 1,
  "description": "This skill has a wrong last_verified_schema.",
  "category": "modeling",
  "risk_level": "LOW",
  "capabilities": ["modeling"],
  "operations": ["create_box"],
  "references": [],
  "last_verified_schema": 99,
  "provenance": {
    "source": "internal",
    "maintainer": "battenmark-team"
  },
  "tags": ["test", "fixture"]
}

// --- Fixture 6: Missing skill.json ---
// skills/failure-no-manifest/SKILL.md
// This directory has SKILL.md but no skill.json

// --- Fixture 7: Missing SKILL.md ---
// skills/failure-no-docs/skill.json
// This directory has skill.json but no SKILL.md