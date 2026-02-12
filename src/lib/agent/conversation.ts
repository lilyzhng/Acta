import fs from 'fs';
import path from 'path';
import { getProjectDir } from '@/lib/project-store';
import type { ConversationState } from '@/types';

const CONVERSATION_FILE = 'conversation.json';

export function loadConversation(projectId: string): ConversationState {
  const dir = getProjectDir(projectId);
  const filePath = path.join(dir, CONVERSATION_FILE);

  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  return { messages: [] };
}

export function saveConversation(
  projectId: string,
  state: ConversationState
): void {
  const dir = getProjectDir(projectId);
  const filePath = path.join(dir, CONVERSATION_FILE);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}
