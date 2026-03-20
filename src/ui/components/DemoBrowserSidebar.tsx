import React, { useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Collapse,
  Group,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  rem,
} from '@mantine/core';
import { observer } from 'mobx-react-lite';
import { useStore } from '../../stores';
import type { HclDemo, HclDemoGroup } from '../../demo';

function isDisabledDemo(demo: HclDemo): boolean {
  return demo.availability === 'disabled';
}

function matchesDemoQuery(demo: HclDemo, query: string): boolean {
  if (query.length === 0) {
    return true;
  }

  const haystack = [
    demo.name,
    demo.summary,
    demo.group,
    demo.purposes.join(' '),
    demo.highlights.join(' '),
    demo.availabilityReason ?? '',
  ].join(' ').toLowerCase();

  return haystack.includes(query);
}

function DemoSection({
  title,
  count,
  defaultExpanded = true,
  children,
}: {
  title: string;
  count: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Box
      style={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        paddingBottom: rem(8),
      }}
    >
      <UnstyledButton
        onClick={() => setExpanded((value) => !value)}
        style={{
          display: 'block',
          width: '100%',
          padding: `${rem(4)} ${rem(2)}`,
        }}
      >
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={rem(6)} wrap="nowrap">
            <Text
              size="xs"
              c="dimmed"
              style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 120ms ease',
              }}
            >
              ›
            </Text>
            <Text fw={700} size="sm" c="gray.0">
              {title}
            </Text>
          </Group>
          <Badge
            size="xs"
            variant="light"
            color="gray"
            radius="sm"
            styles={{
              root: {
                minWidth: rem(28),
                justifyContent: 'center',
              },
            }}
          >
            {count}
          </Badge>
        </Group>
      </UnstyledButton>

      <Collapse in={expanded}>
        <Stack gap={rem(6)} mt={rem(6)}>
          {children}
        </Stack>
      </Collapse>
    </Box>
  );
}

function DemoRow({
  demo,
  selected,
  expanded,
  onSelect,
  onToggleExpanded,
}: {
  demo: HclDemo;
  selected: boolean;
  expanded: boolean;
  onSelect: (filename: string) => void;
  onToggleExpanded: (filename: string) => void;
}): React.ReactElement {
  const disabled = isDisabledDemo(demo);

  return (
    <Box
      style={{
        borderRadius: rem(10),
        border: selected
          ? '1px solid rgba(236, 72, 153, 0.42)'
          : disabled
            ? '1px solid rgba(245, 158, 11, 0.24)'
            : '1px solid rgba(255, 255, 255, 0.08)',
        background: selected
          ? 'linear-gradient(180deg, rgba(76, 29, 149, 0.28) 0%, rgba(17, 24, 39, 0.9) 100%)'
          : disabled
            ? 'linear-gradient(180deg, rgba(69, 26, 3, 0.18) 0%, rgba(17, 24, 39, 0.82) 100%)'
            : 'rgba(255, 255, 255, 0.03)',
        padding: rem(6),
      }}
    >
      <Group wrap="nowrap" gap={rem(4)} align="flex-start">
        <UnstyledButton
          type="button"
          onClick={disabled ? undefined : () => onSelect(demo.filename)}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            borderRadius: rem(8),
            padding: `${rem(4)} ${rem(6)}`,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.72 : 1,
          }}
        >
          <Group justify="space-between" gap="xs" wrap="nowrap" align="center">
            <Text
              fw={600}
              size="sm"
              c="gray.0"
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {demo.name}
            </Text>

            {selected && (
              <Badge size="xs" variant="filled" color="pink" radius="sm">
                Live
              </Badge>
            )}

            {!selected && disabled && (
              <Badge size="xs" variant="light" color="orange" radius="sm">
                Disabled
              </Badge>
            )}
          </Group>
        </UnstyledButton>

        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label={expanded ? `Hide details for ${demo.name}` : `Show details for ${demo.name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleExpanded(demo.filename);
          }}
          styles={{
            root: {
              marginTop: rem(2),
              flexShrink: 0,
            },
          }}
        >
          <span
            style={{
              fontSize: rem(14),
              lineHeight: 1,
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 120ms ease',
            }}
          >
            ›
          </span>
        </ActionIcon>
      </Group>

      <Collapse in={expanded}>
        <Box
          style={{
            padding: `${rem(2)} ${rem(6)} ${rem(4)} ${rem(6)}`,
          }}
        >
          <Stack gap={rem(6)}>
            <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
              {demo.summary}
            </Text>

            {demo.highlights.length > 0 && (
              <Group gap={rem(4)}>
                {demo.highlights.slice(0, 3).map((highlight) => (
                  <Badge
                    key={highlight}
                    size="xs"
                    variant="outline"
                    color="gray"
                    radius="sm"
                    styles={{
                      root: {
                        textTransform: 'none',
                        paddingInline: rem(6),
                      },
                    }}
                  >
                    {highlight}
                  </Badge>
                ))}
              </Group>
            )}

            {disabled && demo.availabilityReason && (
              <Text size="xs" c="orange.2">
                {demo.availabilityReason}
              </Text>
            )}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

export const DemoBrowserSidebar: React.FC = observer(() => {
  const demo = useStore('demo');
  const viewport = useStore('viewport');
  const [demoQuery, setDemoQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  // [LAW:one-source-of-truth] Expanded demo details are keyed by canonical
  // demo filename so filtered views and live selection cannot drift apart.
  const [expandedDemoIds, setExpandedDemoIds] = useState<Set<string>>(() => new Set());

  const normalizedDemoQuery = demoQuery.trim().toLowerCase();
  const activeDemoGroups = useMemo(
    () =>
      demo.groups
        .map((group) => ({
          ...group,
          demos: group.demos.filter(
            (entry) => !isDisabledDemo(entry) && matchesDemoQuery(entry, normalizedDemoQuery),
          ),
        }))
        .filter((group) => group.demos.length > 0),
    [demo.groups, normalizedDemoQuery],
  );
  const disabledDemos = useMemo(
    () =>
      demo.demos.filter(
        (entry) => isDisabledDemo(entry) && matchesDemoQuery(entry, normalizedDemoQuery),
      ),
    [demo.demos, normalizedDemoQuery],
  );

  const handleDemoSelect = (filename: string) => {
    const loaded = demo.selectDemo(filename);
    if (!loaded) {
      const targetDemo = demo.demos.find((entry) => entry.filename === filename);
      setLoadError(
        targetDemo?.availabilityReason
          ? `Demo unavailable: ${targetDemo.availabilityReason}`
          : `Failed to load demo: ${filename}`,
      );
      return;
    }

    // [LAW:single-enforcer] DemoStore owns selection mutation; the sidebar
    // only coordinates derived UI state after the canonical selection changes.
    viewport.resetView();
    setLoadError(null);
  };

  const toggleExpandedDemo = (filename: string) => {
    setExpandedDemoIds((current) => {
      const next = new Set(current);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  return (
    <Box
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: rem(8),
      }}
    >
      <Stack gap={rem(8)}>
        <TextInput
          value={demoQuery}
          onChange={(event) => setDemoQuery(event.currentTarget.value)}
          placeholder="Search demos"
          size="xs"
          radius="md"
          styles={{
            input: {
              minHeight: rem(34),
              paddingInline: rem(10),
              background: 'rgba(255, 255, 255, 0.03)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
            },
          }}
        />

        {loadError && (
          <Text size="xs" c="orange.3">
            {loadError}
          </Text>
        )}

        {activeDemoGroups.map((group: HclDemoGroup) => (
          <DemoSection key={group.key} title={group.label} count={group.demos.length}>
            {group.demos.map((entry) => (
              <DemoRow
                key={entry.filename}
                demo={entry}
                selected={entry.filename === demo.currentFilename}
                expanded={expandedDemoIds.has(entry.filename)}
                onSelect={handleDemoSelect}
                onToggleExpanded={toggleExpandedDemo}
              />
            ))}
          </DemoSection>
        ))}

        {disabledDemos.length > 0 && (
          <DemoSection title="Unavailable" count={disabledDemos.length} defaultExpanded={false}>
            {disabledDemos.map((entry) => (
              <DemoRow
                key={entry.filename}
                demo={entry}
                selected={false}
                expanded={expandedDemoIds.has(entry.filename)}
                onSelect={handleDemoSelect}
                onToggleExpanded={toggleExpandedDemo}
              />
            ))}
          </DemoSection>
        )}
      </Stack>
    </Box>
  );
});
