/**
 * HelpStore - MobX Store for Help Panel State
 *
 * Tracks which help topic is actively highlighted/scrolled-to.
 * Panel visibility is handled by dockview (not this store).
 */

import { makeAutoObservable } from 'mobx';
import type { HelpTopicId } from '../help/types';

export class HelpStore {
  activeTopicId: HelpTopicId | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  showTopic(id: HelpTopicId): void {
    this.activeTopicId = id;
  }

  clearActiveTopic(): void {
    this.activeTopicId = null;
  }
}
