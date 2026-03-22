import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, 'schemas');

const schemaCache = new Map();

async function loadSchema(schemaName) {
  if (schemaCache.has(schemaName)) {
    return schemaCache.get(schemaName);
  }

  const schemaPath = path.join(SCHEMAS_DIR, schemaName);
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
  schemaCache.set(schemaName, schema);
  return schema;
}

function typeOfValue(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function validateValue(schema, value, label) {
  if (schema.$ref) {
    const refName = schema.$ref.replace('./', '');
    const refSchema = schemaCache.get(refName);
    if (!refSchema) {
      throw new Error(`Schema reference not loaded: ${refName}`);
    }
    return validateValue(refSchema, value, label);
  }

  const errors = [];
  const expectedType = schema.type;

  if (expectedType === 'object') {
    if (typeOfValue(value) !== 'object') {
      return [`${label}: expected object, got ${typeOfValue(value)}`];
    }

    const properties = schema.properties || {};
    const required = schema.required || [];

    for (const key of required) {
      if (!(key in value)) {
        errors.push(`${label}: missing required field '${key}'`);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push(`${label}: unexpected field '${key}'`);
        }
      }
    }

    for (const [key, childSchema] of Object.entries(properties)) {
      if (!(key in value)) continue;
      errors.push(...validateValue(childSchema, value[key], `${label}.${key}`));
    }

    return errors;
  }

  if (expectedType === 'array') {
    if (!Array.isArray(value)) {
      return [`${label}: expected array, got ${typeOfValue(value)}`];
    }
    const itemSchema = schema.items;
    if (!itemSchema) return errors;
    value.forEach((item, index) => {
      errors.push(...validateValue(itemSchema, item, `${label}[${index}]`));
    });
    return errors;
  }

  if (expectedType === 'string' && typeof value !== 'string') {
    return [`${label}: expected string, got ${typeOfValue(value)}`];
  }
  if (expectedType === 'boolean' && typeof value !== 'boolean') {
    return [`${label}: expected boolean, got ${typeOfValue(value)}`];
  }
  if (expectedType === 'integer' && !Number.isInteger(value)) {
    return [`${label}: expected integer, got ${typeOfValue(value)}`];
  }
  if (expectedType === 'number' && (typeof value !== 'number' || Number.isNaN(value))) {
    return [`${label}: expected number, got ${typeOfValue(value)}`];
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${label}: invalid value ${JSON.stringify(value)}`);
  }

  return errors;
}

export async function validateAgainstSchema(schemaName, payload, typeName) {
  const schema = await loadSchema(schemaName);

  for (const property of Object.values(schema.properties || {})) {
    if (property && typeof property === 'object' && '$ref' in property) {
      const refName = property.$ref.replace('./', '');
      if (!schemaCache.has(refName)) {
        schemaCache.set(refName, await loadSchema(refName));
      }
    }
  }

  const errors = validateValue(schema, payload, typeName);
  if (errors.length > 0) {
    throw new Error(`Invalid ${typeName}: ${errors.join('; ')}`);
  }
}
