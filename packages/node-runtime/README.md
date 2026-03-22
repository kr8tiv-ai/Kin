# @kr8tiv-ai/node-runtime-truth

Minimal Node persistence seam for KR8TIV runtime truth contracts.

## Purpose
This package is the first Node-side write path for contract-critical runtime state.

It is intentionally small:
- atomic text writes
- atomic JSON writes
- parent directory creation
- per-path in-process write serialization
- `atomically` underneath for safer cross-platform file replacement behavior

## API
- `writeTextAtomic(filePath, content, options?)`
- `writeJsonAtomic(filePath, payload, options?)`

## What it is for
Use it for small, critical runtime state files such as:
- truth surfaces
- promotion records
- provenance records
- local coordination metadata

The record-writer layer now validates concrete contract files before writing:
- truth surface
- promotion decision record
- routing provenance event

## What it is not for
- database replacement
- distributed locking
- huge object storage
- multi-process coordination guarantees by itself

## Test
- `npm test`
f

## Test
- `npm test`
