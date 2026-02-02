/**
 * SettingsPanel Component
 *
 * Renders all registered settings grouped by namespace.
 * Dual-mount: accessible as both Dockview panel and Drawer.
 *
 * Features:
 * - Iterates all registered tokens, ordered by ui.order
 * - Renders appropriate controls based on FieldUIHint.control
 * - Auto-persists on change (no save button needed)
 * - Reset to defaults per section
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Stack,
  Paper,
  Title,
  Text,
  Switch,
  Button,
  Divider,
  rem,
} from '@mantine/core';
import { useStore } from '../../stores';
import { NumberInput } from './common/NumberInput';
import { SelectInput } from './common/SelectInput';
import { TextInput } from './common/TextInput';
import type { SettingsToken, FieldUIHint } from '../../settings/types';

export const SettingsPanel: React.FC = observer(() => {
  const settingsStore = useStore('settings');
  const tokens = settingsStore.getRegisteredTokens();

  return (
    <Stack gap="lg" p="md" style={{ overflowY: 'auto', height: '100%' }}>
      {tokens.length === 0 ? (
        <Text c="dimmed" size="sm">
          No settings registered yet.
        </Text>
      ) : (
        tokens.map((token) => (
          <SettingsSection key={token.namespace} token={token} />
        ))
      )}
    </Stack>
  );
});

/**
 * Single settings section for one namespace.
 */
const SettingsSection: React.FC<{ token: SettingsToken<any> }> = observer(({ token }) => {
  const settingsStore = useStore('settings');
  const values = settingsStore.get(token);

  const handleReset = () => {
    settingsStore.reset(token);
  };

  const handleFieldChange = (key: string, value: unknown) => {
    settingsStore.update(token, { [key]: value });
  };

  return (
    <Paper
      p="md"
      style={{
        background: 'rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
      }}
    >
      <Stack gap="md">
        {/* Section header */}
        <div>
          <Title order={4} size="h5" c="violet">
            {token.ui.label}
          </Title>
          {token.ui.description && (
            <Text size="xs" c="dimmed" mt={rem(4)}>
              {token.ui.description}
            </Text>
          )}
        </div>

        <Divider color="dark.5" />

        {/* Fields */}
        <Stack gap="sm">
          {Object.keys(token.defaults).map((key) => {
            const fieldHint = token.ui.fields[key];
            const value = values[key];
            return (
              <FieldControl
                key={key}
                fieldKey={key}
                value={value}
                hint={fieldHint}
                onChange={(newValue) => handleFieldChange(key, newValue)}
              />
            );
          })}
        </Stack>

        {/* Reset button */}
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          onClick={handleReset}
          styles={{
            root: {
              border: '1px solid rgba(139, 92, 246, 0.2)',
            },
          }}
        >
          Reset to Defaults
        </Button>
      </Stack>
    </Paper>
  );
});

/**
 * Renders a single field control based on its UI hint.
 */
const FieldControl: React.FC<{
  fieldKey: string;
  value: unknown;
  hint: FieldUIHint;
  onChange: (value: unknown) => void;
}> = ({ value, hint, onChange }) => {
  switch (hint.control) {
    case 'toggle':
      return (
        <Switch
          checked={value as boolean}
          onChange={(e) => onChange(e.currentTarget.checked)}
          label={hint.label}
          description={hint.description}
          size="sm"
          color="violet"
          styles={{
            label: {
              fontSize: rem(13),
              color: 'var(--mantine-color-gray-3)',
            },
            description: {
              fontSize: rem(11),
              fontStyle: 'italic',
              opacity: 0.7,
            },
          }}
        />
      );

    case 'number':
      return (
        <NumberInput
          value={value as number}
          onChange={onChange}
          label={hint.label}
          helperText={hint.description}
          min={hint.min}
          max={hint.max}
          step={hint.step}
        />
      );

    case 'slider':
      return (
        <NumberInput
          value={value as number}
          onChange={onChange}
          label={hint.label}
          helperText={hint.description}
          min={hint.min}
          max={hint.max}
          step={hint.step}
        />
      );

    case 'select':
      if (!hint.options) {
        return (
          <Text c="red" size="xs">
            Error: select control requires options
          </Text>
        );
      }
      return (
        <SelectInput
          value={value as string}
          onChange={onChange}
          options={hint.options.map((opt) => ({
            value: String(opt.value),
            label: opt.label,
          }))}
          label={hint.label}
          helperText={hint.description}
        />
      );

    case 'text':
      return (
        <TextInput
          value={value as string}
          onChange={(v) => onChange(v)}
          label={hint.label}
          helperText={hint.description}
        />
      );

    default:
      return (
        <Text c="red" size="xs">
          Unknown control type: {hint.control}
        </Text>
      );
  }
};
