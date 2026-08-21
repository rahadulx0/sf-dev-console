import { Braces, Component, FileCode, FileCode2, LayoutTemplate, Zap } from 'lucide-react';
import type { ComponentType } from 'react';

export interface EditorTypeDef {
  type: string;
  label: string;
  bundle: boolean;
  icon: ComponentType<{ className?: string }>;
}

export const EDITOR_TYPE_DEFS: EditorTypeDef[] = [
  { type: 'ApexClass', label: 'Apex Classes', bundle: false, icon: Braces },
  { type: 'ApexTrigger', label: 'Apex Triggers', bundle: false, icon: Zap },
  { type: 'LightningComponentBundle', label: 'Lightning Web Components', bundle: true, icon: Component },
  { type: 'AuraDefinitionBundle', label: 'Aura Components', bundle: true, icon: LayoutTemplate },
  { type: 'ApexPage', label: 'Visualforce Pages', bundle: false, icon: FileCode },
  { type: 'ApexComponent', label: 'Visualforce Components', bundle: false, icon: FileCode2 },
];

export interface EditorTab {
  key: string;
  type: string;
  fullName: string;
  file: string;
  files: string[];
  mainFile?: string;
  content: string;
  original: string;
  loading: boolean;
  saving: boolean;
}

export const tabKey = (type: string, fullName: string, file: string) => `${type}:${fullName}:${file}`;
export const componentKey = (type: string, fullName: string) => `${type}:${fullName}`;

export function fileLabel(file: string): string {
  const parts = file.split('/');
  return parts[parts.length - 1];
}
