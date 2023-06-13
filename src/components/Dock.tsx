import {DockviewReact, GridviewReact, PaneviewReact} from 'dockview';
import {useRef, useEffect} from 'react';
import {useMonaco} from '@monaco-editor/react';
import {Editor} from './Editor';
import {FileTree} from './FileTree';
import {Terminal} from './Terminal';
import {Watermark} from './Watermark';
import {useSync} from '../hooks/useSync';
import {useShell} from '../hooks/useShell';
import {useDarkMode} from '../hooks/useDarkMode';
import {useLaunchQueue} from '../hooks/useLaunchQueue';

import * as dock from '../utils/dock';

import type {DockviewApi, GridviewApi, PaneviewApi, PanelCollection, IGridviewPanelProps, IPaneviewPanelProps, IDockviewPanelProps} from 'dockview';
import type {FileSystemAPI} from '@webcontainer/api';
import type {ShellInstance} from '../hooks/useShell';
import type {SyncInstance} from '../hooks/useSync';

export function Dock() {
  const shell = useShell();
  const monaco = useMonaco();
  const initTerm = useRef(false);
  const initLaunch = useRef(false);
  const initFileTree = useRef(false);
  const sections = useRef<GridviewApi>();
  const content = useRef<DockviewApi>();
  const panels = useRef<PaneviewApi>();
  const launch = useLaunchQueue();
  const isDark = useDarkMode();
  const sync = useSync(shell);

  // Open terminal when shell is ready
  useEffect(() => {
    if (initTerm.current) return;
    if (shell && sections.current && content.current) {
      initTerm.current = true;
      dock.openTerminal(shell, sections.current, content.current);
    }
  }, [shell]);

  // Open file tree when FS is ready
  useEffect(() => {
    if (initFileTree.current) return;
    if (shell.container?.fs && panels.current && content.current) {
      initFileTree.current = true;
      dock.openFileTree(shell.container.fs, panels.current, content.current, sync);
    }
  }, [shell]);

  // Handle launch queue from PWA
  useEffect(() => {
    if (initLaunch.current) return;
    const fs = shell?.container?.fs;
    const api = content.current;
    if (!fs || !api || !monaco) return;
    // Open files
    if (launch.files.length > 0) {
      launch.files.forEach(file =>
        dock.openStartFile(file, fs, api, sync));
        // TODO: ask for containing folder access
    // Execute action
    } else if (launch.action) {
      switch (launch.action) {
        case 'open_folder': {
          // TODO: trigger via a dialog due to security
          dock.openFolder(fs, api);
          break;
        }
      }
    // Open blank file (if no URL)
    } else if (location.pathname === '/') {
      dock.openUntitledFile(fs, api, sync);
    }
    initLaunch.current = true;
  }, [monaco, launch, shell]);

  return (
    <GridviewReact
      className={isDark ? 'dockview-theme-dark' : 'dockview-theme-light'}
      components={sectionComponents}
      proportionalLayout={false}
      onReady={event => {
        sections.current = event.api;
        event.api.addPanel({
          id: 'content',
          component: 'content',
          params: {api: content},
        });
        event.api.addPanel({
          id: 'panes',
          component: 'panes',
          params: {api: panels},
          maximumWidth: 800,
          size: 200,
          position: {
            direction: 'left',
            referencePanel: 'content',
          },
        });
      }}
    />
  );
}

const contentComponents: PanelCollection<IDockviewPanelProps> = {
  editor: (props: IDockviewPanelProps<{fs: FileSystemAPI, path: string, sync: SyncInstance}>) => (
    <Editor fs={props.params.fs} path={props.params.path} sync={props.params.sync}/>
  ),
  preview: (props: IDockviewPanelProps<{url: string}>) => (
    // @ts-ignore
    <iframe src={props.params.url} allow="cross-origin-isolated" credentialless/>
  ),
};

const sectionComponents: PanelCollection<IGridviewPanelProps> = {
  terminal: (props: IGridviewPanelProps<{content: DockviewApi, shell: ShellInstance}>) => (
    <Terminal
      shell={props.params.shell}
      panelApi={props.api}
      onServerReady={dock.createPreviewOpener(props.params.content)}
    />
  ),
  panes: (props: IGridviewPanelProps<{api: React.MutableRefObject<PaneviewApi>}>) => (
    <PaneviewReact
      components={paneComponents}
      onReady={event => {props.params.api.current = event.api}}
    />
  ),
  content: (props: IGridviewPanelProps<{api: React.MutableRefObject<DockviewApi>}>) => (
    <DockviewReact
      watermarkComponent={Watermark}
      components={contentComponents}
      onReady={event => {props.params.api.current = event.api}}
    />
  ),
};

const paneComponents: PanelCollection<IPaneviewPanelProps> = {
  filetree: (props: IPaneviewPanelProps<{content: DockviewApi, fs: FileSystemAPI, sync: SyncInstance}>) => (
    <FileTree
      fs={props.params.fs}
      onRenameItem={dock.createFileRenameHandler(props.params.content, props.params.fs)}
      onTriggerItem={dock.createFileOpener(props.params.content, props.params.fs, props.params.sync)}
    />
  ),
};
