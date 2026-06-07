# Serena — Semantic Code Tools (Kilo Code)

**Usage**: Navigate and edit code at the symbol level instead of reading and
rewriting whole files. Lower token cost, more precise edits.

## Rule

Before a coding task, call `initial_instructions` once to load the Serena manual.

Use semantic tools instead of full-file reads/writes:

- **Locate**: `find_symbol`, `get_symbols_overview`, `find_referencing_symbols`,
  `find_declaration`, `find_implementations`
- **Edit**: `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`,
  `rename_symbol`, `safe_delete_symbol`
- **Diagnostics**: `get_diagnostics_for_file`
- **Project memory**: `write_memory`, `read_memory`, `list_memories`

## Why

This codebase is large (49 Prisma models, 1396-line schema, many routes/services).
Reading whole files burns context fast. Symbol-level reads pull only the code that
matters, and symbol-level edits avoid brittle full-file rewrites.

Pairs with [rtk-rules.md] (compress shell output) and [caveman-rules.md]
(compress replies) for end-to-end token efficiency.
