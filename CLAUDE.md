## Output Quality Check
When generating project-context exports (CLAUDE.md, AGENTS.md),
compare the output against the reference examples in
`.claude/output/CLAUDE.md.example` and `.claude/output/AGENTS.md.example`.

The examples show a different project (findper/graphify) —
do NOT copy their content. Use them only to validate structure
and quality of the generated output.

A valid export must have:
- Purpose: specific, never "A React application" or "<lang> AI application"
- Stack: language capitalized, all detected runtimes included
- Commands: real commands, never "# see manifest" placeholders with <>
- Module Map: no internal IDs (comm_N, cluster_N), no duplicate raw labels
- Key Symbols: no File nodes, no test files, no example/worked/ paths
- Critical Edges: no test functions
- Tests: grouped as single "Tests (N symbols)" entry if present
