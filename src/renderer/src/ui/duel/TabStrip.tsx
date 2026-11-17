// The console's tab strip (spec 2026-11-17-artemis-consoles §2, §6.3): HELM, WEAPONS, SHIP; current lit, open clickable, locked disabled.
import { memo } from 'react';
import type { ConsoleView, ConsoleStation } from '../../render/duel/consoleModel';
import { TABS } from '../../render/duel/consoleLayout';
import { useActions } from '../context';
import { Button } from '../stage/Button';

const ORDER: readonly [ConsoleStation, string][] = [['helm', 'HELM'], ['weapons', 'WEAPONS'], ['ship', 'SHIP']];
export const TabStrip = memo(function TabStrip({ tabs, tabActions }: Pick<ConsoleView, 'tabs' | 'tabActions'>) {
  const actions = useActions();
  return <>{ORDER.map(([k, label], n) => {
    const a = tabActions[k];
    return <Button key={k} name={`tab-${k}`} x={TABS.x + n * (TABS.w + TABS.gap)} y={TABS.y} w={TABS.w} h={TABS.h} label={label}
      lit={tabs[k] === 'current'} disabled={tabs[k] === 'locked'} onPress={a && tabs[k] === 'open' ? () => actions.console.press(a) : undefined} />;
  })}</>;
});
