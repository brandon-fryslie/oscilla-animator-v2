/**
 * SettingsPanel Component
 *
 * Compact settings panel for the right sidebar.
 * Renders all registered settings grouped by namespace with inline controls.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import {
  Stack,
  Group,
  Text,
  Switch,
  Button,
  Divider,
  Tooltip,
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

  const handleResetAll = () => {
    for (const token of tokens) {
      settingsStore.reset(token);
    }
  };

  return (
    <Stack gap="xs" p="xs" style={{ overflowY: 'auto', height: '100%' }}>
      {tokens.length === 0 ? (
        <Text c="dimmed" size="sm">
          No settings registered yet.
        </Text>
      ) : (
        <>
          {tokens.map((token) => (
            <SettingsSection key={token.namespace} token={token} />
          ))}
          <Divider color="dark.5" mt="xs" />
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            fullWidth
            onClick={handleResetAll}
            styles={{ root: { opacity: 0.6, '&:hover': { opacity: 1 } } }}
          >
            Reset All to Defaults
          </Button>
        </>
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

  const handleFieldChange = (key: string, value: unknown) => {
    settingsStore.update(token, { [key]: value });
  };

  return (
    <Stack gap={rem(2)}>
      <Text size="xs" fw={600} c="violet" mt="xs">
        {token.ui.label}
      </Text>
      <Divider color="dark.5" mb={rem(2)} />
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
  );
});

/**
 * Renders a single field control inline: label left, control right.
 */
const FieldControl: React.FC<{
  fieldKey: string;
  value: unknown;
  hint: FieldUIHint;
  onChange: (value: unknown) => void;
}> = ({ value, hint, onChange }) => {
  const label = (
    <Tooltip label={hint.description} position="left" withArrow multiline maw={250} disabled={!hint.description}>
      <Text size="xs" c="gray.4" style={{ cursor: hint.description ? 'help' : 'default' }}>
        {hint.label}
      </Text>
    </Tooltip>
  );

  switch (hint.control) {
    case 'toggle':
      return (
        <Group justify="space-between" wrap="nowrap" gap="xs" py={rem(1)}>
          {label}
          <Switch
            checked={value as boolean}
            onChange={(e) => onChange(e.currentTarget.checked)}
            size="xs"
            color="violet"
          />
        </Group>
      );

    case 'number':
    case 'slider':
      return (
        <Group justify="space-between" wrap="nowrap" gap="xs" py={rem(1)}>
          {label}
          <NumberInput
            value={value as number}
            onChange={onChange}
            min={hint.min}
            max={hint.max}
            step={hint.step}
            size="xs"
          />
        </Group>
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
        <Group justify="space-between" wrap="nowrap" gap="xs" py={rem(1)}>
          {label}
          <SelectInput
            value={value as string}
            onChange={onChange}
            options={hint.options.map((opt) => ({
              value: String(opt.value),
              label: opt.label,
            }))}
            size="xs"
          />
        </Group>
      );

    case 'text':
      return (
        <Group justify="space-between" wrap="nowrap" gap="xs" py={rem(1)}>
          {label}
          <TextInput
            value={value as string}
            onChange={(v) => onChange(v)}
            size="xs"
          />
        </Group>
      );

    default:
      return (
        <Text c="red" size="xs">
          Unknown control type: {hint.control}
        </Text>
      );
  }
};
