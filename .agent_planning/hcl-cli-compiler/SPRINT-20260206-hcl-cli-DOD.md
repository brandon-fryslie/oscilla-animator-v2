# Definition of Done: HCL CLI Compiler

## Must Pass

1. **`npm run compile:hcl -- <file.hcl>` runs without a browser**
   - No DOM, no React, no canvas dependencies loaded
   - Pure Node.js execution via tsx

2. **Valid patches compile successfully**
   - All 12 demo patches serialized to HCL → compiled → exit 0
   - Output includes meaningful summary (block count, step count)

3. **Invalid patches report errors clearly**
   - HCL syntax errors → reported with position info
   - Compile errors → reported with kind + message + blockId
   - Exit code 1 on any error

4. **Machine-consumable output**
   - `--json` produces valid JSON parseable by `JSON.parse()`
   - JSON schema matches documented format

5. **Tests pass in CI**
   - All new tests pass via `npm run test`
   - No existing tests broken

## Verification Method

```bash
# Serialize a demo patch to HCL file
# (or use a manually-written .hcl file)

# Run the compiler
npm run compile:hcl -- test-patch.hcl
echo $?  # Should be 0

# Run with JSON
npm run compile:hcl -- test-patch.hcl --json | jq .

# Run with bad file
echo 'patch "bad" { block "NonExistent" "x" {} }' > /tmp/bad.hcl
npm run compile:hcl -- /tmp/bad.hcl
echo $?  # Should be 1

# Run tests
npm run test -- compile-hcl
```
