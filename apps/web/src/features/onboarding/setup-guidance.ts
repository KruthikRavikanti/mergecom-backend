import type { DocumentKind } from '../../api/queries';

export type SetupHost = 'excel' | 'powerpoint' | 'word';
export type SetupPlatform = 'mac' | 'web' | 'windows';

const macFolders: Record<SetupHost, string> = {
  excel: '~/Library/Containers/com.microsoft.Excel/Data/Documents/wef',
  powerpoint:
    '~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef',
  word: '~/Library/Containers/com.microsoft.Word/Data/Documents/wef',
};

export function detectSetupPlatform(input: {
  platform?: string | undefined;
  userAgent?: string | undefined;
}): SetupPlatform {
  const value =
    `${input.platform ?? ''} ${input.userAgent ?? ''}`.toLowerCase();
  if (/mac|iphone|ipad/u.test(value)) return 'mac';
  if (/win/u.test(value)) return 'windows';
  return 'web';
}

export function setupSteps(input: {
  host: SetupHost;
  platform: SetupPlatform;
}): string[] {
  if (input.platform === 'mac') {
    return [
      'Close the Office host before replacing an existing manifest.',
      `In Finder, open ${macFolders[input.host]} and create the wef folder if it does not exist.`,
      'Place the downloaded host manifest in that folder, reopen Office, then open the MergeCom task pane.',
    ];
  }
  if (input.platform === 'windows') {
    return [
      'Place the host manifest in a folder shared from this Windows computer.',
      'Add that folder as a trusted web add-in catalog in Office Trust Center, then restart Office.',
      'Choose Home, Add-ins, Advanced, SHARED FOLDER, select MergeCom, and choose Add.',
    ];
  }
  return [
    'Open a document in Word, Excel, or PowerPoint on the web.',
    'Choose Home, Add-ins, More Settings, then Upload My Add-in.',
    'Select the downloaded host manifest and choose Upload.',
  ];
}

export function documentKindForSetupHost(host: SetupHost): DocumentKind {
  return host === 'excel'
    ? 'spreadsheet'
    : host === 'powerpoint'
      ? 'presentation'
      : 'word_document';
}
