import { executeInElectron } from '../../utils/electron-connection';
import { WindowTargetSchema } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = WindowTargetSchema;

/**
 * Quick-look dump: top 10 visible buttons + top 10 visible inputs with their
 * key attributes. Useful as a first step before clicking/filling something.
 */
const debugElementsScript = `
  (function() {
    const buttons = Array.from(document.querySelectorAll('button')).map(btn => ({
      text: btn.textContent?.trim(),
      id: btn.id,
      className: btn.className,
      disabled: btn.disabled,
      visible: btn.getBoundingClientRect().width > 0,
      type: btn.type || 'button'
    }));

    const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map(inp => ({
      name: inp.name,
      placeholder: inp.placeholder,
      type: inp.type,
      id: inp.id,
      // Never echo the contents of password fields — debug output is shown to the
      // caller and may end up in audit logs.
      value: inp.type === 'password' ? '[REDACTED]' : inp.value,
      visible: inp.getBoundingClientRect().width > 0,
      enabled: !inp.disabled
    }));

    return JSON.stringify({
      buttons: buttons.filter(b => b.visible).slice(0, 10),
      inputs: inputs.filter(i => i.visible).slice(0, 10),
      url: window.location.href,
      title: document.title
    }, null, 2);
  })()
`;

export const debugElements = defineCommand({
  name: 'electron_debug_elements',
  description:
    'Get debugging info about top 10 visible buttons and form elements. Useful before clicking/filling.',
  schema,
  operationType: 'query',
  async execute(_args, target) {
    return executeInElectron(debugElementsScript, target);
  },
});
