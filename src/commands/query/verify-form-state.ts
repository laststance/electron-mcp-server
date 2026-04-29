import { executeInElectron } from '../../utils/electron-connection';
import { WindowTargetSchema } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = WindowTargetSchema;

/**
 * Walks every `<form>` and reports its inputs + HTML5 validity state.
 * Used after fill_input commands to confirm React state actually settled.
 */
const verifyFormStateScript = `
  (function() {
    const forms = Array.from(document.querySelectorAll('form')).map(form => {
      const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map(inp => {
        // Redact obvious secret fields. Type === 'password' catches HTML5
        // password inputs; the name/autocomplete checks catch tokens and
        // API-key inputs that legitimately use type="text".
        const lowerName = (inp.name || '').toLowerCase();
        const lowerType = (inp.type || '').toLowerCase();
        const autocomplete = (inp.autocomplete || '').toLowerCase();
        const isSensitive =
          lowerType === 'password' ||
          autocomplete === 'current-password' ||
          autocomplete === 'new-password' ||
          /password|token|secret|api[_-]?key/.test(lowerName);
        return {
          name: inp.name,
          type: inp.type,
          value: isSensitive ? '[REDACTED]' : inp.value,
          placeholder: inp.placeholder,
          required: inp.required,
          valid: inp.validity?.valid
        };
      });

      return {
        id: form.id,
        action: form.action,
        method: form.method,
        inputs: inputs,
        // Use a typeof check so a legitimate \`false\` result (form is invalid)
        // doesn't get coerced into the 'unknown' sentinel by ||.
        isValid: typeof form.checkValidity === 'function' ? form.checkValidity() : 'unknown'
      };
    });

    return JSON.stringify({ forms, formCount: forms.length }, null, 2);
  })()
`;

export const verifyFormState = defineCommand({
  name: 'electron_verify_form_state',
  description:
    'Inspect every <form> on the page: inputs, values, and HTML5 validity. Use after fill_input to confirm state.',
  schema,
  operationType: 'query',
  async execute(_args, target) {
    return executeInElectron(verifyFormStateScript, target);
  },
});
