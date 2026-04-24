function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function splitArrayType(type) {
  const match = type.match(/^(.*)\[(\d*)\]$/);
  if (!match) return null;
  return {
    baseType: match[1],
    fixedLength: match[2] === '' ? null : Number(match[2])
  };
}

function isIntegerLike(value) {
  if (typeof value === 'bigint') return true;
  if (typeof value === 'number') return Number.isInteger(value);
  if (value && typeof value === 'object' && value._isBigNumber) {
    return typeof value._value === 'string' && /^-?\d+$/.test(value._value);
  }
  return typeof value === 'string' && /^-?\d+$/.test(value);
}

function isBytesLike(value, expectedBytes = null) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) return false;
  if ((value.length - 2) % 2 !== 0) return false;
  if (expectedBytes === null) return true;
  return value.length === 2 + (expectedBytes * 2);
}

function validateTypedValue(type, value, components = [], fieldName = type) {
  const arrayInfo = splitArrayType(type);
  if (arrayInfo) {
    if (!Array.isArray(value)) {
      return `${fieldName} should decode to an array`;
    }
    if (arrayInfo.fixedLength !== null && value.length !== arrayInfo.fixedLength) {
      return `${fieldName} should have length ${arrayInfo.fixedLength}, got ${value.length}`;
    }
    for (let i = 0; i < value.length; i++) {
      const issue = validateTypedValue(arrayInfo.baseType, value[i], components, `${fieldName}[${i}]`);
      if (issue) return issue;
    }
    return null;
  }

  if (type === 'tuple') {
    if (!Array.isArray(value) && !isPlainObject(value)) {
      return `${fieldName} should decode to a tuple structure`;
    }
    if (Array.isArray(value) && components.length && value.length < components.length) {
      return `${fieldName} is missing tuple components`;
    }
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const componentValue = Array.isArray(value)
        ? value[i]
        : value[component.name] ?? value[i];
      const issue = validateTypedValue(
        component.type,
        componentValue,
        component.components || [],
        `${fieldName}.${component.name || i}`
      );
      if (issue) return issue;
    }
    return null;
  }

  if (type === 'address') {
    return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
      ? null
      : `${fieldName} should decode to an address`;
  }
  if (type === 'bool') {
    return (value === true || value === false || value === 'true' || value === 'false')
      ? null
      : `${fieldName} should decode to a boolean`;
  }
  if (type === 'string') {
    return typeof value === 'string' ? null : `${fieldName} should decode to a string`;
  }
  if (type === 'bytes') {
    return isBytesLike(value) ? null : `${fieldName} should decode to hex bytes`;
  }
  if (/^bytes\d+$/.test(type)) {
    const size = Number(type.slice(5));
    return isBytesLike(value, size) ? null : `${fieldName} should decode to ${type}`;
  }
  if (/^(u?int)(\d+)?$/.test(type)) {
    return isIntegerLike(value) ? null : `${fieldName} should decode to an integer`;
  }
  return value !== undefined ? null : `${fieldName} is missing`;
}

function parseParamValue(input, decoded) {
  const typedRawValue = decoded?.rawParams?.[input.name];

  if (typedRawValue === undefined) {
    return {
      parsed: undefined,
      error: `${input.name || input.type} is missing from rawParams`
    };
  }

  if (typeof typedRawValue === 'string' && typedRawValue === '[object Object]') {
    return { parsed: typedRawValue, error: `${input.name || input.type} collapsed to [object Object]` };
  }

  const isStructuredType = input.type === 'tuple' || input.type.includes('[');
  if (!isStructuredType) {
    return { parsed: typedRawValue, error: null };
  }

  if (typeof typedRawValue !== 'string') {
    return { parsed: typedRawValue, error: null };
  }

  try {
    return { parsed: JSON.parse(typedRawValue), error: null };
  } catch {
    return {
      parsed: typedRawValue,
      error: `${input.name || input.type} is not JSON-encoded for structured ABI translation`
    };
  }
}

export function validateDecodedResultForAbiStructure(decoded, abiFn) {
  const issues = [];

  if (!decoded || typeof decoded !== 'object') {
    return { ok: false, issues: ['decoder returned no result'] };
  }

  if (decoded.success !== true) {
    issues.push(`decode did not succeed: ${decoded.error || 'unknown error'}`);
  }

  if (decoded.functionName !== abiFn.name) {
    issues.push(`functionName mismatch: expected ${abiFn.name}, got ${decoded.functionName || 'missing'}`);
  }

  if (!isPlainObject(decoded.params)) {
    issues.push('params object is missing');
  }
  if (!isPlainObject(decoded.rawParams)) {
    issues.push('rawParams object is missing');
  }

  for (const input of (abiFn.inputs || [])) {
    const paramName = input.name;
    if (!paramName) continue;

    const { parsed, error } = parseParamValue(input, decoded);
    if (error) {
      issues.push(error);
      continue;
    }

    const typeIssue = validateTypedValue(input.type, parsed, input.components || [], paramName);
    if (typeIssue) {
      issues.push(typeIssue);
    }
  }

  return {
    ok: issues.length === 0,
    issues
  };
}
