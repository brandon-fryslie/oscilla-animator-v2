import React, { useMemo, useState } from 'react';
import {
  Accordion,
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Menu,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
  rem,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { observer } from 'mobx-react-lite';
import type { DockviewApi } from 'dockview';
import { useStore } from '../../../stores';
import { clearStorageAndReload } from '../../../services/PatchPersistence';
import { useExportPatch } from '../../hooks/useExportPatch';
import { Toast } from '../common/Toast';
import {
  openOrFocusPanel,
  resetDockviewLayout,
  toggleSidebar,
} from '../../dockview/layoutActions';
import { PANEL_MENU_ITEMS } from '../../dockview/panelRegistry';
import type { HclDemo, HclDemoGroup } from '../../../demo';

interface ToolbarProps {
  stats?: string;
  dockviewApi?: DockviewApi | null;
}

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

function DemoCard({
  demo,
  selected,
  featured = false,
  onSelect,
}: {
  demo: HclDemo;
  selected: boolean;
  featured?: boolean;
  onSelect: (filename: string) => void;
}): React.ReactElement {
  const disabled = isDisabledDemo(demo);
  const Component = disabled ? 'div' : 'button';

  return (
    <Box
      component={Component}
      type={disabled ? undefined : 'button'}
      onClick={disabled ? undefined : () => onSelect(demo.filename)}
      style={{
        width: '100%',
        textAlign: 'left',
        borderRadius: rem(14),
        border: selected
          ? '1px solid rgba(236, 72, 153, 0.55)'
          : disabled
            ? '1px solid rgba(245, 158, 11, 0.28)'
            : '1px solid rgba(139, 92, 246, 0.18)',
        background: selected
          ? 'linear-gradient(180deg, rgba(76, 29, 149, 0.45) 0%, rgba(45, 27, 105, 0.3) 100%)'
          : disabled
            ? 'linear-gradient(180deg, rgba(69, 26, 3, 0.28) 0%, rgba(31, 41, 55, 0.28) 100%)'
            : 'linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.5) 100%)',
        padding: rem(12),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.72 : 1,
        transition: 'border-color 140ms ease, transform 140ms ease',
      }}
    >
      <Stack gap={rem(8)}>
        <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
          <Stack gap={rem(2)} style={{ minWidth: 0, flex: 1 }}>
            <Text fw={700} size="sm" c="gray.0" style={{ whiteSpace: 'normal', lineHeight: 1.2 }}>
              {demo.name}
            </Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>
              {demo.summary}
            </Text>
          </Stack>
          <Badge
            size="xs"
            variant={selected ? 'filled' : 'light'}
            color={
              selected
                ? 'pink'
                : disabled
                  ? 'orange'
                  : featured
                    ? 'grape'
                    : demo.group === 'showcase'
                      ? 'pink'
                      : demo.group === 'stress'
                        ? 'red'
                        : demo.group === 'integration'
                          ? 'orange'
                          : 'violet'
            }
            radius="sm"
            style={{ flexShrink: 0, alignSelf: 'flex-start' }}
          >
            {selected ? 'Live' : disabled ? 'Disabled' : featured ? 'Featured' : demo.group}
          </Badge>
        </Group>

        <Group gap={rem(6)}>
          {demo.highlights.slice(0, 3).map((highlight) => (
            <Badge key={highlight} size="xs" variant="outline" color="gray" radius="sm">
              {highlight}
            </Badge>
          ))}
        </Group>

        {disabled && demo.availabilityReason && (
          <Text size="xs" c="orange.2">
            {demo.availabilityReason}
          </Text>
        )}
      </Stack>
    </Box>
  );
}

export const Toolbar: React.FC<ToolbarProps> = observer(({ stats = 'FPS: --', dockviewApi }) => {
  const camera = useStore('camera');
  const patch = useStore('patch');
  const demo = useStore('demo');
  const viewport = useStore('viewport');
  const diagnostics = useStore('diagnostics');
  const isMobile = useMediaQuery('(max-width: 48em)');

  const exportPatch = useExportPatch();

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');
  const [demoBrowserOpen, setDemoBrowserOpen] = useState(false);
  const [demoQuery, setDemoQuery] = useState('');

  const panelMenuItems = useMemo(() => PANEL_MENU_ITEMS, []);
  const normalizedDemoQuery = demoQuery.trim().toLowerCase();
  const currentDemo = useMemo(
    () => demo.demos.find((entry) => entry.filename === demo.currentFilename) ?? null,
    [demo.currentFilename, demo.demos],
  );
  const featuredDemos = useMemo(
    () =>
      demo.demos.filter(
        (entry) =>
          !isDisabledDemo(entry) &&
          entry.purposes.includes('showcase') &&
          matchesDemoQuery(entry, normalizedDemoQuery),
      ).slice(0, 4),
    [demo.demos, normalizedDemoQuery],
  );
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
    () => demo.demos.filter((entry) => isDisabledDemo(entry) && matchesDemoQuery(entry, normalizedDemoQuery)),
    [demo.demos, normalizedDemoQuery],
  );

  const handleExport = async () => {
    const result = await exportPatch();
    setToastMessage(result.message);
    setToastSeverity(result.success ? 'success' : 'error');
    setToastOpen(true);
    if (!result.success && result.error) {
      diagnostics.log({
        level: 'error',
        message: `Export error: ${result.error}`,
      });
    }
  };

  const handleNewPatch = () => {
    if (!confirm('Create a new patch? This clears the current patch.')) {
      return;
    }
    patch.clear();
    setToastMessage('New patch created');
    setToastSeverity('success');
    setToastOpen(true);
  };

  const handleDemoSelect = (filename: string) => {
    const loaded = demo.selectDemo(filename);
    if (!loaded) {
      const targetDemo = demo.demos.find((entry) => entry.filename === filename);
      setToastMessage(
        targetDemo?.availabilityReason
          ? `Demo unavailable: ${targetDemo.availabilityReason}`
          : `Failed to load demo: ${filename}`,
      );
      setToastSeverity('error');
      setToastOpen(true);
      return;
    }
    viewport.resetView();
    setDemoBrowserOpen(false);
    setToastMessage(`Loaded demo: ${filename}`);
    setToastSeverity('success');
    setToastOpen(true);
  };

  const patchMenu = (
    <Menu shadow="md" width={220} withinPortal>
      <Menu.Target>
        <Button variant="subtle" color="gray" size="xs">Patch</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={handleNewPatch}>New</Menu.Item>
        <Menu.Item disabled>Save</Menu.Item>
        <Menu.Item disabled>Load</Menu.Item>
        <Menu.Item onClick={handleExport}>Export</Menu.Item>
        <Menu.Divider />
        <Menu.Item onClick={clearStorageAndReload}>Reset Storage</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const layoutMenu = (
    <Menu shadow="md" width={220} withinPortal>
      <Menu.Target>
        <Button variant="subtle" color="gray" size="xs">Layout</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'left')}
          disabled={!dockviewApi}
        >
          Toggle Left Sidebar
        </Menu.Item>
        <Menu.Item
          onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'right')}
          disabled={!dockviewApi}
        >
          Toggle Right Sidebar
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          onClick={() => dockviewApi && resetDockviewLayout(dockviewApi)}
          disabled={!dockviewApi}
        >
          Reset Layout
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const panelsMenu = (
    <Menu shadow="md" width={240} withinPortal>
      <Menu.Target>
        <Button variant="subtle" color="gray" size="xs">Panels</Button>
      </Menu.Target>
      <Menu.Dropdown>
        {panelMenuItems.map((panel) => (
          <Menu.Item
            key={panel.id}
            onClick={() => dockviewApi && openOrFocusPanel(dockviewApi, panel.id)}
            disabled={!dockviewApi}
          >
            {panel.title}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );

  const mobileActionsMenu = (
    <Menu shadow="md" width={280} withinPortal>
      <Menu.Target>
        <Button variant="subtle" color="gray" size="xs">Menu</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Patch</Menu.Label>
        <Menu.Item onClick={handleNewPatch}>New Patch</Menu.Item>
        <Menu.Item onClick={handleExport}>Export Patch</Menu.Item>
        <Menu.Item onClick={clearStorageAndReload}>Reset Storage</Menu.Item>
        <Menu.Divider />
        <Menu.Label>Layout</Menu.Label>
        <Menu.Item onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'left')} disabled={!dockviewApi}>
          Toggle Left Sidebar
        </Menu.Item>
        <Menu.Item onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'right')} disabled={!dockviewApi}>
          Toggle Right Sidebar
        </Menu.Item>
        <Menu.Item onClick={() => dockviewApi && resetDockviewLayout(dockviewApi)} disabled={!dockviewApi}>
          Reset Layout
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>Panels</Menu.Label>
        {panelMenuItems.map((panel) => (
          <Menu.Item
            key={panel.id}
            onClick={() => dockviewApi && openOrFocusPanel(dockviewApi, panel.id)}
            disabled={!dockviewApi}
          >
            {panel.title}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item onClick={() => camera.toggle()}>
          {camera.isActive ? 'Disable 3D Camera' : 'Enable 3D Camera'}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  return (
    <>
      <Box
        component="header"
        style={{
          flexShrink: 0,
          height: rem(52),
          background: 'linear-gradient(180deg, rgba(30, 30, 46, 0.98) 0%, rgba(24, 24, 37, 0.98) 100%)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Group h="100%" px={isMobile ? 'xs' : 'md'} justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Tooltip label="Toggle left sidebar" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Toggle left sidebar"
                onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'left')}
              >
                <span style={{ fontSize: rem(13), fontWeight: 700 }}>☰</span>
              </ActionIcon>
            </Tooltip>
            <Box
              style={{
                width: rem(32),
                height: rem(32),
                borderRadius: rem(8),
                background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 50%, #F59E0B 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
                flexShrink: 0,
              }}
            >
              <Text fw={700} size="sm" c="white">O</Text>
            </Box>
            <Group gap="xs" wrap="nowrap">
              <Text
                fw={600}
                size={isMobile ? 'md' : 'lg'}
                variant="gradient"
                gradient={{ from: 'violet', to: 'grape', deg: 45 }}
              >
                Oscilla v2
              </Text>
              {!isMobile && (
                <Badge
                  size="xs"
                  variant="gradient"
                  gradient={{ from: 'violet', to: 'grape', deg: 90 }}
                  style={{ textTransform: 'uppercase' }}
                >
                  Alpha
                </Badge>
              )}
            </Group>
          </Group>

          <Group gap="xs" wrap="nowrap">
            {!isMobile && (
              <Badge
                variant="outline"
                color="dark"
                size="lg"
                radius="md"
                styles={{
                  root: {
                    fontFamily: 'var(--mantine-font-family-monospace)',
                    fontWeight: 500,
                    fontSize: rem(11),
                    padding: `${rem(4)} ${rem(12)}`,
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  },
                }}
              >
                {stats}
              </Badge>
            )}

            {diagnostics.gpuFaultState && (
              <Tooltip
                label={diagnostics.gpuFaultState.message}
                withArrow
                multiline
                w={300}
              >
                <Badge
                  variant="filled"
                  color={diagnostics.gpuFaultState.severity === 'fatal' ? 'red' : 'orange'}
                  size="lg"
                  radius="md"
                  styles={{
                    root: {
                      fontFamily: 'var(--mantine-font-family-monospace)',
                      fontWeight: 700,
                      fontSize: rem(11),
                      padding: `${rem(4)} ${rem(12)}`,
                      cursor: 'help',
                    },
                  }}
                >
                  {diagnostics.gpuFaultState.severity === 'fatal' ? 'GPU LOST' : 'GPU ERROR'}
                </Badge>
              </Tooltip>
            )}

            <Button
              variant="gradient"
              gradient={{ from: 'violet', to: 'grape', deg: 90 }}
              color="gray"
              size="xs"
              onClick={() => setDemoBrowserOpen(true)}
            >
              Demos
            </Button>

            {isMobile ? (
              mobileActionsMenu
            ) : (
              <>
                {patchMenu}
                {layoutMenu}
                {panelsMenu}
                <Button
                  variant={camera.isActive ? 'gradient' : 'subtle'}
                  gradient={{ from: 'violet', to: 'grape', deg: 90 }}
                  color="gray"
                  size="xs"
                  onClick={() => camera.toggle()}
                >
                  3D
                </Button>
              </>
            )}

            <Tooltip label="Toggle right sidebar" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="Toggle right sidebar"
                onClick={() => dockviewApi && toggleSidebar(dockviewApi, 'right')}
              >
                <span style={{ fontSize: rem(13), fontWeight: 700 }}>☰</span>
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Box>

      <Drawer
        opened={demoBrowserOpen}
        onClose={() => setDemoBrowserOpen(false)}
        position="right"
        size={isMobile ? '100%' : rem(480)}
        padding="md"
        title={
          <Stack gap={0}>
            <Text fw={700}>Demo Browser</Text>
            <Text size="xs" c="dimmed">
              Browse by purpose, summary, and availability instead of a flat menu bar.
            </Text>
          </Stack>
        }
      >
        <Stack gap="md">
          {currentDemo && (
            <Paper
              withBorder
              radius="md"
              p="sm"
              style={{
                background: 'linear-gradient(180deg, rgba(76, 29, 149, 0.24) 0%, rgba(15, 23, 42, 0.5) 100%)',
                borderColor: 'rgba(236, 72, 153, 0.3)',
              }}
            >
              <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
                <Stack gap={rem(2)} style={{ minWidth: 0 }}>
                  <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                    Current Demo
                  </Text>
                  <Text fw={700} size="sm" c="gray.0" style={{ whiteSpace: 'normal', lineHeight: 1.2 }}>
                    {currentDemo.name}
                  </Text>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>
                    {currentDemo.summary}
                  </Text>
                </Stack>
                <Badge size="xs" variant="filled" color="pink" style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
                  Live
                </Badge>
              </Group>
            </Paper>
          )}

          <TextInput
            value={demoQuery}
            onChange={(event) => setDemoQuery(event.currentTarget.value)}
            placeholder="Search demos, highlights, or status"
          />

          {featuredDemos.length > 0 && (
            <>
              <Stack gap={0}>
                <Text fw={700} size="sm">Featured</Text>
                <Text size="xs" c="dimmed">
                  Quick path to the strongest visual demos.
                </Text>
              </Stack>
              <SimpleGrid cols={1} spacing="sm">
                {featuredDemos.map((entry) => (
                  <DemoCard
                    key={entry.filename}
                    demo={entry}
                    selected={entry.filename === demo.currentFilename}
                    featured
                    onSelect={handleDemoSelect}
                  />
                ))}
              </SimpleGrid>
              <Divider />
            </>
          )}

          <Accordion
            multiple
            variant="separated"
            radius="md"
            defaultValue={[
              ...activeDemoGroups.map((group) => group.key),
              ...(disabledDemos.length > 0 ? ['disabled'] : []),
            ]}
          >
            {activeDemoGroups.map((group: HclDemoGroup) => (
              <Accordion.Item key={group.key} value={group.key}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={0}>
                      <Text fw={700} size="sm">{group.label}</Text>
                      <Text size="xs" c="dimmed">
                        {group.demos.length} available
                      </Text>
                    </Stack>
                    <Badge size="xs" variant="light" color="violet">
                      {group.key}
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    {group.demos.map((entry) => (
                      <DemoCard
                        key={entry.filename}
                        demo={entry}
                        selected={entry.filename === demo.currentFilename}
                        onSelect={handleDemoSelect}
                      />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}

            {disabledDemos.length > 0 && (
              <Accordion.Item value="disabled">
                <Accordion.Control>
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={0}>
                      <Text fw={700} size="sm">Temporarily Disabled</Text>
                      <Text size="xs" c="dimmed">
                        {disabledDemos.length} hidden from live selection
                      </Text>
                    </Stack>
                    <Badge size="xs" variant="light" color="orange">
                      hold
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    {disabledDemos.map((entry) => (
                      <DemoCard
                        key={entry.filename}
                        demo={entry}
                        selected={false}
                        onSelect={handleDemoSelect}
                      />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            )}
          </Accordion>
        </Stack>
      </Drawer>

      <Toast
        open={toastOpen}
        message={toastMessage}
        severity={toastSeverity}
        onClose={() => setToastOpen(false)}
      />
    </>
  );
});
