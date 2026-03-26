# KIN Repo Layout Proposal

## Goal

Define a low-churn file layout for the first runnable KIN milestone.

## Proposed Layout

```text
specs/
  kin-solo-harness.yaml
  mission-control-pack.md
  notebook-query-contract.json
  safety-policy.md
  onboarding-script.md
  local-model-strategy.md
runtime/
  tenant/
    harness.yaml
    openclaw.json
  mission-control/
    packs/
      kin-cipher-v1.md
    telemetry/
      README.md
  tools/
    notebook-query/
      schema.json
      README.md
  docs/
    onboarding.md
    operations.md
verification/
  contracts/
    validate-specs.md
  checklists/
    kin-baseline.md
```

## Rationale

- Keep `specs/` as design-time source material.
- Put executable or near-executable runtime artifacts under `runtime/`.
- Separate tool contracts and Mission Control pack assets so M002 can wire them independently.
- Put verification artifacts in a visible top-level location to support the GSD done-gate style.

## Migration Rule

M002 should copy or promote stable material from `specs/` into `runtime/` rather than editing the original design docs in place.
